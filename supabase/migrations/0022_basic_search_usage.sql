-- Basic (non-AI) DTC search rate limiting — Free plan only, 3/UTC-day and
-- 10/calendar-month, per docs/PRICING_AND_AI_COST_AUDIT.md. Only successful
-- interactive searches (searchDtcCodes() returning at least one result)
-- count; direct /dtc/[code] page views never touch this table at all.
--
-- Identity: authenticated users are keyed by their real user_id
-- ('user'). Anonymous visitors are keyed by a server-issued, httpOnly
-- random identifier minted in src/proxy.ts (never a client-editable
-- value) — 'anon'. This is a coarse, privacy-conscious mechanism, not a
-- hardened anti-bot system: a script that discards cookies between
-- requests can still get a fresh identifier each time. Documented as a
-- known limitation in docs/PRICING_AND_AI_COST_AUDIT.md rather than
-- silently claimed as bot-proof.
create table basic_search_usage (
  id uuid primary key default gen_random_uuid(),
  identifier_type text not null check (identifier_type in ('user', 'anon')),
  identifier text not null,
  created_at timestamptz not null default now()
);

create index basic_search_usage_identifier_created_idx
  on basic_search_usage (identifier_type, identifier, created_at);

-- Atomic check-and-record, same UTC-anchored day/month pattern and
-- per-identifier advisory-lock serialization as record_ai_diagnostic_usage
-- (migration 0016). No idempotency key here (unlike AI usage) — a search
-- has no "retry after provider failure" concern, so every successful call
-- is a genuinely new event, not a reservation.
create or replace function record_basic_search_usage(
  p_identifier_type text,
  p_identifier text,
  p_daily_limit integer,
  p_monthly_limit integer
)
returns text as $$
declare
  v_daily_count integer;
  v_monthly_count integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_identifier_type || ':' || p_identifier));

  if p_daily_limit is not null then
    select count(*)::integer into v_daily_count
    from basic_search_usage
    where identifier_type = p_identifier_type
      and identifier = p_identifier
      and (created_at at time zone 'utc')::date = (now() at time zone 'utc')::date;

    if v_daily_count >= p_daily_limit then
      return 'daily_limit_exceeded';
    end if;
  end if;

  if p_monthly_limit is not null then
    select count(*)::integer into v_monthly_count
    from basic_search_usage
    where identifier_type = p_identifier_type
      and identifier = p_identifier
      and (created_at at time zone 'utc') >= date_trunc('month', now() at time zone 'utc');

    if v_monthly_count >= p_monthly_limit then
      return 'monthly_limit_exceeded';
    end if;
  end if;

  insert into basic_search_usage (identifier_type, identifier)
  values (p_identifier_type, p_identifier);

  return 'recorded';
end;
$$ language plpgsql security definer;

create or replace function get_basic_search_usage_summary(p_identifier_type text, p_identifier text)
returns table (
  searches_used_today integer,
  searches_used_this_month integer
) as $$
  select
    count(*) filter (
      where (created_at at time zone 'utc')::date = (now() at time zone 'utc')::date
    )::integer as searches_used_today,
    count(*)::integer as searches_used_this_month
  from basic_search_usage
  where identifier_type = p_identifier_type
    and identifier = p_identifier
    and (created_at at time zone 'utc') >= date_trunc('month', now() at time zone 'utc');
$$ language sql stable security definer;

-- No RLS policies (deny-all except the service-role client) — matches the
-- ai_usage/admin_settings precedent for internal-accounting tables a user
-- never needs to query directly.
alter table basic_search_usage enable row level security;
