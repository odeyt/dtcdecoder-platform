-- Privilege hardening for every pre-existing `security definer` function
-- that had no protection against being called directly via PostgREST's
-- /rpc endpoint. Discovered while reviewing migration 0055's new BCEL
-- functions: Supabase auto-grants EXECUTE on every new public-schema
-- function to `anon` AND `authenticated` by default, regardless of
-- `security definer` (github.com/supabase/supabase#43884) — and a
-- full-history search confirms no migration in this project has EVER
-- issued a REVOKE or GRANT on a function. Every function below has been
-- exposed to any signed-in (and in some cases any anonymous) client since
-- the migration that created it.
--
-- This was PARTIALLY discovered once before: migration
-- 0036_diagnostic_engine_usage_rpc_authorization.sql fixed exactly this
-- class of issue for record_diagnostic_engine_usage/
-- get_diagnostic_engine_usage_summary using an in-function
-- `auth.role() = 'service_role' or auth.uid() = p_user_id` check, and its
-- own comment explicitly flagged get_ai_diagnostic_usage_summary/
-- record_ai_diagnostic_usage (migration 0016) as "the identical pattern...
-- out of scope for this migration... flagged separately as a follow-up,
-- not fixed here." That follow-up was never done. This migration finishes
-- it, and extends the same review to every other security-definer
-- function in the schema.
--
-- Approach: REVOKE/GRANT (matching 0055's BCEL functions) rather than
-- adding in-function auth.uid() checks (matching 0036's older pattern).
-- Chosen because it requires no function-body changes — lower risk to
-- verify against a shared production database with no staging environment
-- to test in first — and is provably complete: after this runs, every
-- function below is reachable ONLY via this app's own server-side code
-- (which authenticates as service_role and performs its own
-- ownership/admin checks before ever calling these), never directly from
-- a browser session. Idempotent: safe to re-run.
--
-- Severity found, worst first (see the chat review for full detail):
--
-- CRITICAL — grant_addon_pack and grant_single_report_purchase both use
-- `on conflict (creem_order_id) where creem_order_id is not null do
-- nothing` as their only idempotency guard, which never fires when
-- creem_order_id is NULL. Called directly with p_creem_order_id: null,
-- either function unconditionally inserts — a repeatable, real,
-- money-equivalent free-credit exploit, live today.
--
-- HIGH — redeem_single_report_purchase has no identity check at all;
-- callable with any p_user_id/p_case_id, letting an attacker consume a
-- victim's purchase credit against the attacker's own case.
--
-- MEDIUM — record_ai_diagnostic_usage / get_ai_diagnostic_usage_summary
-- (targeted allowance-exhaustion DoS / cross-user usage-count read leak)
-- and consume_report_followup / consume_report_regeneration (targeted
-- allowance-exhaustion DoS, needs a guessed/leaked case_id).
--
-- LOW — record_basic_search_usage / get_basic_search_usage_summary key on
-- an anonymous identifier, not a real account; worst case is rate-limit-
-- counter integrity, not money or entitlement.
--
-- DEAD CODE, still hardened anyway — get_monthly_ai_tokens /
-- increment_ai_tokens (0004) and get_monthly_scan_usage /
-- consume_scan_usage_slot (0013) are superseded by migration 0016 per its
-- own header comment; increment_ai_usage (0003) is superseded the same
-- way. None are called anywhere in current src/, but "not currently used
-- by the app" isn't "safe" — they still write/read real tables via a
-- still-exposed RPC.
--
-- ALREADY HAD AN IN-FUNCTION CHECK — record_diagnostic_engine_usage /
-- get_diagnostic_engine_usage_summary (0036) are revoked here too anyway,
-- for defense in depth: one consistent policy (service_role only) rather
-- than two different protection mechanisms doing the same job.
--
-- DELIBERATELY EXCLUDED — increment_dtc_search_count (0003) is a
-- search-popularity counter meant to be incremented by anonymous visitors
-- performing a real DTC search; revoking it would break that feature.
-- Worst-case abuse (spamming increments for one code) only skews an
-- internal "top searched codes" admin view, not money or entitlement.

revoke execute on function grant_addon_pack(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function grant_addon_pack(uuid, text, integer, text) to service_role;

revoke execute on function grant_single_report_purchase(uuid, text) from public, anon, authenticated;
grant execute on function grant_single_report_purchase(uuid, text) to service_role;

revoke execute on function redeem_single_report_purchase(uuid, uuid) from public, anon, authenticated;
grant execute on function redeem_single_report_purchase(uuid, uuid) to service_role;

revoke execute on function record_ai_diagnostic_usage(uuid, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function record_ai_diagnostic_usage(uuid, text, text, text, integer, integer) to service_role;

revoke execute on function get_ai_diagnostic_usage_summary(uuid) from public, anon, authenticated;
grant execute on function get_ai_diagnostic_usage_summary(uuid) to service_role;

revoke execute on function consume_report_followup(uuid, integer) from public, anon, authenticated;
grant execute on function consume_report_followup(uuid, integer) to service_role;

revoke execute on function consume_report_regeneration(uuid, integer) from public, anon, authenticated;
grant execute on function consume_report_regeneration(uuid, integer) to service_role;

revoke execute on function record_basic_search_usage(text, text, integer, integer) from public, anon, authenticated;
grant execute on function record_basic_search_usage(text, text, integer, integer) to service_role;

revoke execute on function get_basic_search_usage_summary(text, text) from public, anon, authenticated;
grant execute on function get_basic_search_usage_summary(text, text) to service_role;

revoke execute on function get_monthly_ai_tokens(uuid) from public, anon, authenticated;
grant execute on function get_monthly_ai_tokens(uuid) to service_role;

revoke execute on function increment_ai_tokens(uuid, bigint) from public, anon, authenticated;
grant execute on function increment_ai_tokens(uuid, bigint) to service_role;

revoke execute on function get_monthly_scan_usage(uuid) from public, anon, authenticated;
grant execute on function get_monthly_scan_usage(uuid) to service_role;

revoke execute on function consume_scan_usage_slot(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function consume_scan_usage_slot(uuid, uuid, integer) to service_role;

revoke execute on function increment_ai_usage(uuid) from public, anon, authenticated;
grant execute on function increment_ai_usage(uuid) to service_role;

revoke execute on function record_diagnostic_engine_usage(uuid, text, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function record_diagnostic_engine_usage(uuid, text, text, text, text, integer, integer) to service_role;

revoke execute on function get_diagnostic_engine_usage_summary(uuid, text) from public, anon, authenticated;
grant execute on function get_diagnostic_engine_usage_summary(uuid, text) to service_role;
