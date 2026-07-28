-- Phase 2.1 — Diagnostic Engine turn-shaped usage ledger
-- (docs/PHASE_2_1_INTEGRATION_AUDIT.md §4, docs/PHASE_2_1_RELEASE_PLAN.md).
--
-- A DELIBERATELY SEPARATE table from ai_diagnostic_usage (migration 0016),
-- not an extension of it. That table's enforcement function
-- (record_ai_diagnostic_usage) counts usage by `access_level` only, with NO
-- `feature` filter in its daily/monthly count queries — reusing it for a
-- new feature value would silently pool a Diagnostic Engine turn's count
-- together with unrelated "chat"/"scan_report" full-report usage, which
-- would be wrong (a turn is a small, frequent unit of work — roughly one
-- per question answered — not a full report; conflating the two counters
-- would exhaust a technician's monthly report allowance after a few
-- Guided Diagnosis questions). This migration's function filters by
-- feature explicitly, so the two ledgers can never cross-contaminate each
-- other's counts. Purely additive — does not touch ai_diagnostic_usage,
-- ai_diagnostic_runs, or any existing table/column/row.
--
-- Idempotent (Phase 2 direct-production release, docs/PHASE_2_PRODUCTION_MIGRATION_RUNBOOK.md):
-- table/index creation uses IF NOT EXISTS; both functions already use
-- CREATE OR REPLACE (safe to rerun); the policy is preceded by DROP POLICY
-- IF EXISTS since Postgres has no CREATE POLICY IF NOT EXISTS.
create table if not exists diagnostic_engine_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  request_id text not null,
  feature text not null check (feature in (
    'diagnostic_engine_turn', 'guided_diagnosis', 'repair_verification', 'advanced_test_planner'
  )),
  plan text not null check (plan in ('free', 'pro', 'workshop')),
  -- 'internal' is a distinct access level from 'preview'/'full' — an
  -- allowlisted internal tester's usage is still recorded (never silently
  -- unobserved), but is never counted against any plan's own preview/full
  -- limits, and is excluded from ordinary plan-usage summaries.
  access_level text not null check (access_level in ('preview', 'full', 'internal')),
  created_at timestamptz not null default now()
);

create unique index if not exists diagnostic_engine_usage_user_request_idx
  on diagnostic_engine_usage (user_id, request_id);
create index if not exists diagnostic_engine_usage_user_feature_created_idx
  on diagnostic_engine_usage (user_id, feature, created_at);

-- Same shape as record_ai_diagnostic_usage (0016): per-user advisory lock,
-- UTC-anchored daily/monthly windows, idempotent on (user_id, request_id),
-- NULL limit means "no cap on this dimension" (used for internal testers,
-- who pass NULL/NULL from the application layer). The one behavioral
-- difference from 0016's function: counts are filtered by `feature` too,
-- not just `access_level` — see the header comment above for why.
create or replace function record_diagnostic_engine_usage(
  p_user_id uuid,
  p_request_id text,
  p_feature text,
  p_plan text,
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
    select 1 from diagnostic_engine_usage
    where user_id = p_user_id and request_id = p_request_id
  ) into v_already;
  if v_already then
    return 'already_recorded';
  end if;

  if p_daily_limit is not null then
    select count(*)::integer into v_daily_count
    from diagnostic_engine_usage
    where user_id = p_user_id
      and feature = p_feature
      and (created_at at time zone 'utc')::date = (now() at time zone 'utc')::date;

    if v_daily_count >= p_daily_limit then
      return 'daily_limit_exceeded';
    end if;
  end if;

  if p_monthly_limit is not null then
    select count(*)::integer into v_monthly_count
    from diagnostic_engine_usage
    where user_id = p_user_id
      and feature = p_feature
      and (created_at at time zone 'utc') >= date_trunc('month', now() at time zone 'utc');

    if v_monthly_count >= p_monthly_limit then
      return 'monthly_limit_exceeded';
    end if;
  end if;

  insert into diagnostic_engine_usage (user_id, request_id, feature, plan, access_level)
  values (p_user_id, p_request_id, p_feature, p_plan, p_access_level);

  return 'recorded';
end;
$$ language plpgsql security definer;

-- Real, current usage for observability/account-page display — same UTC
-- anchoring, filtered to one feature per call (a caller wanting all four
-- feature keys' summaries calls this four times, which is fine at this
-- table's expected volume).
create or replace function get_diagnostic_engine_usage_summary(p_user_id uuid, p_feature text)
returns table (
  used_today integer,
  used_this_month integer
) as $$
  select
    count(*) filter (
      where (created_at at time zone 'utc')::date = (now() at time zone 'utc')::date
    )::integer as used_today,
    count(*) filter (
      where (created_at at time zone 'utc') >= date_trunc('month', now() at time zone 'utc')
    )::integer as used_this_month
  from diagnostic_engine_usage
  where user_id = p_user_id and feature = p_feature;
$$ language sql stable security definer;

alter table diagnostic_engine_usage enable row level security;

drop policy if exists diagnostic_engine_usage_owner_read on diagnostic_engine_usage;
create policy diagnostic_engine_usage_owner_read on diagnostic_engine_usage
  for select using (auth.uid() = user_id);
