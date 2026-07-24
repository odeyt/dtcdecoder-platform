-- Unified AI-diagnostic usage ledger and cost-observability log, shared by
-- both AI features ("DTC Assistant" chat and "Scan Report Analysis"). Free
-- users get a small daily allowance of redacted previews; paid plans get a
-- daily+monthly allowance of full reports — one shared counter per user
-- across both features, since both are the same underlying product action
-- ("AI diagnostic analysis" vs. plain DTC lookup).
--
-- This supersedes ai_usage/increment_ai_usage/get_monthly_ai_tokens/
-- increment_ai_tokens (0003/0004, chat-only) and scan_usage/
-- consume_scan_usage_slot/get_monthly_scan_usage (0013, scan-only) as the
-- enforcement source of truth. Additive only — none of those tables/
-- functions are touched here; application code simply stops calling them.
-- See docs/PRICING_ROLLBACK_PLAN.md.

-- Billing ledger: one row per successfully-granted AI diagnostic
-- generation (a "slot"). Unique on (user_id, request_id) so a client retry
-- with the same request_id after a failed attempt is a no-op, never a
-- double-charge — and a request that never succeeds never gets a row at
-- all, so failed attempts never consume usage.
create table ai_diagnostic_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  request_id text not null,
  feature text not null check (feature in ('chat', 'scan_report')),
  access_level text not null check (access_level in ('preview', 'full')),
  created_at timestamptz not null default now()
);

create unique index ai_diagnostic_usage_user_request_idx
  on ai_diagnostic_usage (user_id, request_id);
create index ai_diagnostic_usage_user_access_created_idx
  on ai_diagnostic_usage (user_id, access_level, created_at);

-- Cost/observability log: one row per AI provider call attempt, success or
-- failure, independent of whether it consumed a billing slot. Never read
-- by any enforcement path — purely for internal cost monitoring, never
-- exposed to customers.
create table ai_diagnostic_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  request_id text not null,
  feature text not null check (feature in ('chat', 'scan_report')),
  plan text not null check (plan in ('free', 'pro', 'workshop')),
  provider_id text not null,
  model_id text not null,
  status text not null check (status in ('completed', 'failed')),
  access_level_requested text not null check (access_level_requested in ('preview', 'full')),
  input_tokens integer,
  output_tokens integer,
  cached_tokens integer,
  estimated_cost_usd numeric(10, 6),
  error_message text,
  created_at timestamptz not null default now()
);

create index ai_diagnostic_runs_user_created_idx on ai_diagnostic_runs (user_id, created_at desc);

-- Atomic check-and-record. Daily/monthly windows are anchored to UTC
-- explicitly (not the database session's timezone) so the reset boundary
-- is unambiguous regardless of server configuration. A per-user advisory
-- lock serializes concurrent calls for the same user within the
-- transaction, so two simultaneous requests can't both pass the
-- count-check before either has inserted (the race the older
-- consume_scan_usage_slot function was exposed to).
--
-- p_daily_limit / p_monthly_limit of NULL mean "no cap on this dimension"
-- (used for the free-tier preview counter, which only has a daily limit).
create or replace function record_ai_diagnostic_usage(
  p_user_id uuid,
  p_request_id text,
  p_feature text,
  p_access_level text,
  p_daily_limit integer,
  p_monthly_limit integer
)
returns text as $$
declare
  v_already boolean;
  v_daily_count integer;
  v_monthly_count integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select exists(
    select 1 from ai_diagnostic_usage
    where user_id = p_user_id and request_id = p_request_id
  ) into v_already;
  if v_already then
    return 'already_recorded';
  end if;

  if p_daily_limit is not null then
    select count(*)::integer into v_daily_count
    from ai_diagnostic_usage
    where user_id = p_user_id
      and access_level = p_access_level
      and (created_at at time zone 'utc')::date = (now() at time zone 'utc')::date;

    if v_daily_count >= p_daily_limit then
      return 'daily_limit_exceeded';
    end if;
  end if;

  if p_monthly_limit is not null then
    select count(*)::integer into v_monthly_count
    from ai_diagnostic_usage
    where user_id = p_user_id
      and access_level = p_access_level
      and (created_at at time zone 'utc') >= date_trunc('month', now() at time zone 'utc');

    if v_monthly_count >= p_monthly_limit then
      return 'monthly_limit_exceeded';
    end if;
  end if;

  insert into ai_diagnostic_usage (user_id, request_id, feature, access_level)
  values (p_user_id, p_request_id, p_feature, p_access_level);

  return 'recorded';
end;
$$ language plpgsql security definer;

-- Real, current usage for the account page / preflight display — same UTC
-- anchoring as the enforcement function above.
create or replace function get_ai_diagnostic_usage_summary(p_user_id uuid)
returns table (
  previews_used_today integer,
  full_reports_used_today integer,
  full_reports_used_this_month integer
) as $$
  select
    count(*) filter (
      where access_level = 'preview'
        and (created_at at time zone 'utc')::date = (now() at time zone 'utc')::date
    )::integer as previews_used_today,
    count(*) filter (
      where access_level = 'full'
        and (created_at at time zone 'utc')::date = (now() at time zone 'utc')::date
    )::integer as full_reports_used_today,
    count(*) filter (
      where access_level = 'full'
        and (created_at at time zone 'utc') >= date_trunc('month', now() at time zone 'utc')
    )::integer as full_reports_used_this_month
  from ai_diagnostic_usage
  where user_id = p_user_id;
$$ language sql stable security definer;

alter table ai_diagnostic_usage enable row level security;
alter table ai_diagnostic_runs enable row level security;

create policy ai_diagnostic_usage_owner_read on ai_diagnostic_usage
  for select using (auth.uid() = user_id);

create policy ai_diagnostic_runs_owner_read on ai_diagnostic_runs
  for select using (auth.uid() = user_id);
