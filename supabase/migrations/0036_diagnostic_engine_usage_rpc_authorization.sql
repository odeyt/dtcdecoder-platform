-- Phase 2 direct-production release — Step 6 RLS validation finding.
-- Both diagnostic_engine_usage RPC functions (migration 0032) are
-- `security definer` with no identity check inside the function body,
-- because their only intended caller is this app's server-side code via
-- the service-role admin client (createAdminClient() in usage.ts — every
-- call site confirmed, no user-session client ever calls either
-- function). But `security definer` functions are still directly
-- reachable via the public anon/authenticated key through PostgREST's
-- /rpc endpoint, bypassing the app entirely. Without a check, ANY caller
-- (anonymous included) could pass an arbitrary p_user_id:
--   - get_diagnostic_engine_usage_summary: read that user's turn-usage
--     counts (not diagnostic content — a narrower leak than case data,
--     but still real, unauthorized cross-user access).
--   - record_diagnostic_engine_usage: INSERT a usage row attributed to
--     that other real user, fabricating their usage history and
--     potentially exhausting their daily/monthly limit as a targeted
--     denial-of-service — a write-side issue, more serious than the read
--     leak above.
--
-- Fix: both functions now require the caller to either be the app's own
-- service-role connection (auth.role() = 'service_role', which has no
-- JWT and therefore no auth.uid() — this is what every real call site
-- uses today, so this exact case must stay permitted) OR an authenticated
-- user whose own auth.uid() matches the p_user_id they're asking about.
-- Every other caller (anonymous, or an authenticated user asking about
-- someone else's ID) gets zero rows / a denial, never someone else's
-- data. auth.role() is a standard Supabase-provided helper present in
-- every Supabase project, not something this migration defines.
--
-- The identical pattern exists in the older, pre-existing
-- get_ai_diagnostic_usage_summary/record_ai_diagnostic_usage (migration
-- 0016) — out of scope for this migration (different feature, different
-- release), flagged separately as a follow-up, not fixed here.
--
-- Idempotent: CREATE OR REPLACE, safe to rerun.

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
  if auth.role() <> 'service_role' and auth.uid() <> p_user_id then
    raise exception 'not authorized' using errcode = '42501';
  end if;

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
  where user_id = p_user_id
    and feature = p_feature
    and (auth.role() = 'service_role' or auth.uid() = p_user_id);
$$ language sql stable security definer;
