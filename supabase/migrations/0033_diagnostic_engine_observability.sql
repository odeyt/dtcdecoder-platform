-- Phase 2.1 — Diagnostic Engine turn observability/cost log
-- (docs/PHASE_2_1_OBSERVABILITY.md). Mirrors ai_diagnostic_runs (migration
-- 0016) in spirit — one row per turn ATTEMPT, success/skip/failure alike,
-- never read by any enforcement path, purely for internal cost/operational
-- monitoring. A separate table rather than extending ai_diagnostic_runs
-- for the same reason migration 0032 is separate from ai_diagnostic_usage:
-- different feature shape (per-turn, not per-report), and no existing
-- migration is altered.
--
-- PRIVACY: every column here is structured/categorical metadata only.
-- There is NO column for prompt text, VIN, complaint text, symptom text,
-- technician notes, or any other free-text customer/vehicle content —
-- only counts, enum-like categories, and short controlled strings
-- (skip_reason/failure_category are fixed vocabularies, enforced by check
-- constraints below, never raw error messages).
--
-- Idempotent (Phase 2 direct-production release, docs/PHASE_2_PRODUCTION_MIGRATION_RUNBOOK.md):
-- table/index creation uses IF NOT EXISTS; the policy is preceded by
-- DROP POLICY IF EXISTS since Postgres has no CREATE POLICY IF NOT EXISTS.
create table if not exists diagnostic_engine_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  case_id uuid not null references scan_cases (id) on delete cascade,
  request_id text not null,
  plan text not null check (plan in ('free', 'pro', 'workshop')),
  rollout_tier text not null check (rollout_tier in ('disabled', 'internal_only', 'allowlist_only', 'all_paid_users')),
  provider_id text,
  provider_called boolean not null default false,
  skip_reason text check (skip_reason in ('evidence_unchanged_since_graph', null)),
  prompt_cache_status text check (prompt_cache_status in ('not_applicable', 'cache_write', 'cache_hit', 'unknown')),
  input_tokens integer,
  output_tokens integer,
  estimated_cost_usd numeric(10, 6),
  latency_ms integer,
  evidence_count integer not null default 0,
  graph_version integer,
  hypothesis_count integer not null default 0,
  confidence_band text check (confidence_band in ('high', 'medium', 'low', 'insufficient_evidence')),
  safety_classification text check (
    safety_classification in ('safe_to_drive', 'drive_with_caution', 'tow_recommended', 'immediate_stop')
  ),
  schema_validation_result text not null default 'not_applicable'
    check (schema_validation_result in ('valid', 'invalid', 'not_applicable')),
  status text not null check (status in ('completed', 'skipped', 'failed')),
  failure_category text check (failure_category in (
    'provider_timeout', 'provider_rate_limit', 'invalid_structured_response', 'database_persistence_failure',
    'entitlement_exhausted', 'feature_disabled', 'ownership_denied', 'cost_ceiling_exceeded',
    'unknown_error', null
  )),
  created_at timestamptz not null default now()
);

create index if not exists diagnostic_engine_runs_user_created_idx on diagnostic_engine_runs (user_id, created_at desc);
create index if not exists diagnostic_engine_runs_case_idx on diagnostic_engine_runs (case_id);

alter table diagnostic_engine_runs enable row level security;

drop policy if exists diagnostic_engine_runs_owner_read on diagnostic_engine_runs;
create policy diagnostic_engine_runs_owner_read on diagnostic_engine_runs
  for select using (auth.uid() = user_id);
