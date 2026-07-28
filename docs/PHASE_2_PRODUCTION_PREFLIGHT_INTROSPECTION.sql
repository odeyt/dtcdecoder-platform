-- Phase 2 direct-production release — read-only schema introspection.
-- Run this FIRST in the Supabase SQL Editor, before any migration below.
-- Every statement here is SELECT-only: it reads catalog metadata, never
-- modifies data or schema, and is always safe to run any number of times.
--
-- Purpose: a real schema diff (table/column/constraint/index/RLS state)
-- that a service-role REST probe cannot see (PostgREST doesn't expose
-- information_schema/pg_catalog), to confirm exactly which of migrations
-- 0030-0035 are already applied before running anything.

-- 1. Which of the six new Phase 2 tables already exist.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'diagnostic_evidence', 'diagnostic_graph', 'diagnostic_questions',
    'diagnostic_answers', 'diagnostic_probabilities', 'repair_verifications',
    'diagnostic_engine_usage', 'diagnostic_engine_runs'
  )
order by table_name;
-- Expected BEFORE any of 0031-0033 are applied: zero rows.

-- 2. diagnostic_engine_runs columns (0033 baseline + 0035 additions).
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'diagnostic_engine_runs'
order by ordinal_position;
-- Expected BEFORE 0033: zero rows (table doesn't exist).
-- Expected AFTER 0033 but BEFORE 0035: no is_internal/model_id/
--   estimated_cost_usd_preflight/cached_input_tokens/blocked_budget_scope columns.
-- Expected AFTER 0035: all five present.

-- 3. Current analytics_events.event_type check-constraint definition
--    (confirms whether 0027's original list or 0030's widened list is live).
--    Uses to_regclass (returns NULL, not an error, if the table is absent)
--    rather than a bare ::regclass cast, so this stays safe to run even
--    before any of 0030-0035 have been applied.
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = to_regclass('public.analytics_events')
  and contype = 'c';

-- 4. Current diagnostic_evidence.evidence_type check-constraint definition
--    (confirms whether 0031's original list or 0034's hv_safety_hazard-widened
--    list is live). Returns zero rows, not an error, before 0031 is applied.
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = to_regclass('public.diagnostic_evidence')
  and contype = 'c'
  and conname = 'diagnostic_evidence_evidence_type_check';

-- 5. RLS enabled state on every Phase 2 table (should be true for all that exist).
select relname as table_name, relrowsecurity as rls_enabled, relforcerowsecurity as rls_forced
from pg_class
where relname in (
  'diagnostic_evidence', 'diagnostic_graph', 'diagnostic_questions',
  'diagnostic_answers', 'diagnostic_probabilities', 'repair_verifications',
  'diagnostic_engine_usage', 'diagnostic_engine_runs'
)
and relnamespace = 'public'::regnamespace;

-- 6. Existing RLS policies on every Phase 2 table (name + command + using-expression).
select tablename, policyname, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename in (
    'diagnostic_evidence', 'diagnostic_graph', 'diagnostic_questions',
    'diagnostic_answers', 'diagnostic_probabilities', 'repair_verifications',
    'diagnostic_engine_usage', 'diagnostic_engine_runs'
  )
order by tablename;

-- 7. Existing indexes on every Phase 2 table.
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'diagnostic_evidence', 'diagnostic_graph', 'diagnostic_questions',
    'diagnostic_answers', 'diagnostic_probabilities', 'repair_verifications',
    'diagnostic_engine_usage', 'diagnostic_engine_runs'
  )
order by tablename, indexname;

-- 8. record_diagnostic_engine_usage / get_diagnostic_engine_usage_summary
--    function existence (0032).
select proname, pg_get_function_identity_arguments(oid) as args
from pg_proc
where proname in ('record_diagnostic_engine_usage', 'get_diagnostic_engine_usage_summary');

-- 9. Row-count sanity on tables the new migrations depend on / must not disturb.
--    Confirms scan_cases (the FK target for every new table) is non-empty
--    and reachable, and that pre-existing ledgers are untouched.
select 'scan_cases' as table_name, count(*) from scan_cases
union all
select 'ai_diagnostic_usage', count(*) from ai_diagnostic_usage
union all
select 'analytics_events', count(*) from analytics_events
union all
select 'ai_routing_decisions', count(*) from ai_routing_decisions;
