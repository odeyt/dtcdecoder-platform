-- Fixes two broken check constraints on diagnostic_engine_runs, introduced
-- in migration 0033_diagnostic_engine_observability.sql. Both were written
-- as `check (col in ('a', 'b', ..., null))` — a literal `null` inside the
-- IN-list. Under SQL three-valued logic, `x IN (list, NULL)` evaluates to
-- NULL (not FALSE) whenever x doesn't match any listed string, and Postgres
-- CHECK constraints only reject FALSE, never NULL — so both constraints
-- have been no-ops since they were created, silently accepting any string
-- value instead of enforcing the intended fixed vocabulary. Confirmed live
-- against production: an arbitrary bogus string inserted successfully into
-- both columns.
--
-- The correct form is `check (col is null or col in (...))`, which lets a
-- genuine NULL (no failure/no skip) through while still rejecting any
-- non-matching string.
--
-- Also widens failure_category's list to include 'budget_exceeded' and
-- 'kill_switch_active' (src/lib/diagnostic-engine/observability.ts's
-- classifyFailure(), lines mapping DiagnosticEngineBudgetExceededError and
-- DiagnosticEngineKillSwitchError) — both are already written by that code
-- today, only passing because the constraint was a no-op. Fixing the NULL
-- bug without adding these would start rejecting values the app already
-- relies on.
--
-- Idempotent, same "drop if exists then unconditional add" pattern used
-- throughout this repo's check-constraint migrations — rerunning this file
-- is always safe.

alter table diagnostic_engine_runs drop constraint if exists diagnostic_engine_runs_failure_category_check;
alter table diagnostic_engine_runs add constraint diagnostic_engine_runs_failure_category_check
  check (
    failure_category is null or failure_category in (
      'provider_timeout',
      'provider_rate_limit',
      'invalid_structured_response',
      'database_persistence_failure',
      'entitlement_exhausted',
      'feature_disabled',
      'ownership_denied',
      'cost_ceiling_exceeded',
      'unknown_error',
      'budget_exceeded',
      'kill_switch_active'
    )
  );

alter table diagnostic_engine_runs drop constraint if exists diagnostic_engine_runs_skip_reason_check;
alter table diagnostic_engine_runs add constraint diagnostic_engine_runs_skip_reason_check
  check (skip_reason is null or skip_reason in ('evidence_unchanged_since_graph'));
