-- Multi-model diagnostic orchestrator (docs/MULTI_MODEL_ORCHESTRATOR.md) —
-- one new, purely additive table. ai_routing_decisions is a case-level
-- routing SUMMARY (one row per orchestrated analyze run): which provider
-- was primary, whether/why a review was escalated, and the budget state at
-- the time. Distinct from ai_diagnostic_runs (migrations 0016/0023), which
-- is one row per PROVIDER CALL and already carries per-call cost/token
-- data — this table does not duplicate any of that, it only adds the
-- case-level "why did routing decide what it decided" record the spec
-- calls for that ai_diagnostic_runs has no natural home for.
--
-- Never written to unless AI_ORCHESTRATOR_ENABLED=true (default false) —
-- an environment that never enables the orchestrator will simply have an
-- empty table forever, which is expected and harmless.

create table ai_routing_decisions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references scan_cases (id) on delete cascade,
  primary_provider text not null,
  reviewer_provider text,
  reason_code text not null check (reason_code in (
    'PRIMARY_ONLY', 'LOW_CONFIDENCE', 'SAFETY_CRITICAL', 'CONTRADICTORY_DATA',
    'UNSUPPORTED_CLAIM', 'MULTIMODAL_REQUIRED', 'QUALITY_AUDIT',
    'PREMIUM_CONSENSUS', 'PROVIDER_FAILURE', 'BUDGET_LIMIT', 'HUMAN_REVIEW_REQUIRED'
  )),
  explanation text not null default '',
  confidence_before numeric(5, 2),
  confidence_after numeric(5, 2),
  budget_state text not null check (budget_state in ('normal', 'warning', 'restrict', 'hard_stop')),
  budget_reasons text[] not null default '{}',
  human_review_required boolean not null default false,
  escalated boolean not null default false,
  created_at timestamptz not null default now()
);

create index ai_routing_decisions_case_id_idx on ai_routing_decisions (case_id);
create index ai_routing_decisions_created_idx on ai_routing_decisions (created_at desc);

alter table ai_routing_decisions enable row level security;

-- Same owner-read pattern as scan_systems/scan_patterns (migration 0028) —
-- a routing decision is visible only to the case's own owner; there is no
-- customer-facing UI for this today (it's an internal/admin diagnostic
-- record), but RLS is applied regardless per this repo's existing
-- convention of never leaving a table without row-level isolation.
create policy ai_routing_decisions_owner_read on ai_routing_decisions
  for select using (
    exists (select 1 from scan_cases c where c.id = case_id and c.user_id = auth.uid())
  );
