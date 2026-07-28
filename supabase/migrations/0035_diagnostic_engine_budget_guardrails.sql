-- Phase 2.2 Steps 6-8 — aggregate cost/budget guardrails
-- (docs/PHASE_2_2_COST_GUARDRAILS.md). Adds the one column
-- diagnostic_engine_runs was missing to support an internal-testing
-- budget dimension distinct from ordinary plan spend: `is_internal`, set
-- from resolveDiagnosticEngineAccess's own determination (the allowlist
-- check), not re-derived from `plan` (an internal tester's plan is still
-- their real free/pro/workshop plan — "internal" is a separate axis, not
-- a fourth plan value). Purely additive.
alter table diagnostic_engine_runs
  add column if not exists is_internal boolean not null default false;

create index if not exists diagnostic_engine_runs_internal_created_idx
  on diagnostic_engine_runs (is_internal, created_at) where is_internal;

-- Phase 2.2 Step 8 cost-observability extension
-- (docs/PHASE_2_2_COST_GUARDRAILS.md): model_id was never captured before
-- (only provider_id); estimated_cost_usd is renamed in spirit to mean the
-- RECONCILED (post-call, real-token-count) cost, with a new
-- estimated_cost_usd_preflight column holding the pre-call/"reserved"
-- estimate guardCostCeiling actually checked. cached_input_tokens
-- captures Anthropic prompt-cache read tokens where the provider result
-- surfaces them (currently always NULL — see
-- docs/PHASE_2_1_OBSERVABILITY.md's known limitation on cache-status
-- plumbing). blocked_budget_scope is set only on a budget-caused failure,
-- for internal diagnosis of which dimension (global/user/internal,
-- daily/monthly) triggered it — never surfaced to the end user.
alter table diagnostic_engine_runs
  add column if not exists model_id text,
  add column if not exists estimated_cost_usd_preflight numeric(10, 6),
  add column if not exists cached_input_tokens integer,
  add column if not exists blocked_budget_scope text;
