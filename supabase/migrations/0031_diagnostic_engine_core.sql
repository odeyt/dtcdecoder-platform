-- Phase 2 — Evidence-Based Diagnostic Engine (docs/PHASE_2_ARCHITECTURE.md).
-- Purely additive: six new tables, all keyed to the EXISTING scan_cases
-- table (not a new, parallel case entity) — a "case" is a case regardless
-- of whether it started from a scan upload (Phase 0), a quick DTC entry,
-- or a landing/consultation intake (Phase 1). No existing table, column,
-- or row is touched. Every table follows the same owner-read RLS pattern
-- already established (scan_systems/scan_patterns, migration 0028).
--
-- Idempotent (Phase 2 direct-production release, docs/PHASE_2_PRODUCTION_MIGRATION_RUNBOOK.md):
-- every CREATE TABLE/INDEX below is "IF NOT EXISTS"; ENABLE ROW LEVEL
-- SECURITY is a no-op if already enabled; every CREATE POLICY is preceded
-- by a DROP POLICY IF EXISTS with the same name, since Postgres has no
-- "CREATE POLICY IF NOT EXISTS". Rerunning this file after a partial or
-- full prior apply is always safe and converges to the same end state.

-- One row per structured fact the engine has collected for a case —
-- everything from VIN to a technician's typed answer to a diagnostic
-- question becomes a row here, never just appended to a free-text
-- complaint field. `confidence` is categorical (high/medium/low/unknown),
-- matching this app's established "never fabricate a numerical confidence"
-- policy (docs/DIAGNOSTIC_SAFETY_RULES.md) — there is no numeric score
-- column here that could be misread as a calibrated probability.
create table if not exists diagnostic_evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references scan_cases (id) on delete cascade,
  evidence_type text not null check (evidence_type in (
    'vin', 'vehicle', 'engine', 'transmission', 'mileage',
    'complaint', 'symptom', 'dtc_stored', 'dtc_pending', 'dtc_permanent',
    'freeze_frame', 'live_data', 'previous_repair', 'known_repair',
    'technician_note', 'safety_issue', 'environmental_condition',
    'question_answer', 'other'
  )),
  value jsonb not null,
  source text not null check (source in (
    'extraction', 'user_reported', 'technician_entered', 'question_answer',
    'scan_report', 'derived'
  )),
  confidence text not null default 'unknown' check (confidence in ('high', 'medium', 'low', 'unknown')),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists diagnostic_evidence_case_id_idx on diagnostic_evidence (case_id);
create index if not exists diagnostic_evidence_type_idx on diagnostic_evidence (case_id, evidence_type);

-- The evolving diagnostic graph — ONE current-state row per case (upserted
-- in place on every recompute, matching the existing scan_extractions
-- upsert-on-case_id pattern), not a history log. `version` increments on
-- every update so a consumer can detect a stale read. Nodes/edges are
-- JSONB rather than normalized graph tables — this is a single-case,
-- single-writer structure with no cross-case graph queries required, so a
-- fully relational node/edge schema would add migration/query complexity
-- with no real benefit here.
create table if not exists diagnostic_graph (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references scan_cases (id) on delete cascade,
  nodes jsonb not null default '[]',
  edges jsonb not null default '[]',
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists diagnostic_graph_case_id_idx on diagnostic_graph (case_id);

-- One row per question the Question Engine has generated for a case, in
-- the order asked. `priority_score` is an INTERNAL ordering value only
-- (never shown to a user as a probability/statistic) — it is how the
-- engine chose this question over other candidates, analogous to
-- confidence.ts's existing internalScore/confidenceLevel split.
create table if not exists diagnostic_questions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references scan_cases (id) on delete cascade,
  sequence integer not null,
  field_key text not null,
  question_text text not null,
  response_type text not null default 'text' check (response_type in ('text', 'yes_no', 'choice')),
  choices text[] not null default '{}',
  priority_score numeric(5, 2),
  asked_at timestamptz not null default now(),
  answered boolean not null default false
);

create index if not exists diagnostic_questions_case_id_idx on diagnostic_questions (case_id, sequence);

create table if not exists diagnostic_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references diagnostic_questions (id) on delete cascade,
  case_id uuid not null references scan_cases (id) on delete cascade,
  answer_text text not null,
  answer_value jsonb,
  answered_at timestamptz not null default now()
);

create unique index if not exists diagnostic_answers_question_id_idx on diagnostic_answers (question_id);
create index if not exists diagnostic_answers_case_id_idx on diagnostic_answers (case_id);

-- Current ranked-hypothesis snapshot — deleted and reinserted on every
-- recompute (matching the existing scan_patterns delete-then-insert
-- convention, migration 0028/analyze.ts), never accumulated as history.
-- `confidence_level` reuses the same categorical enum as
-- scan_reports.confidence_level — no numeric percentage column exists on
-- this table, by design (see docs/PROBABILITY_ENGINE.md).
create table if not exists diagnostic_probabilities (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references scan_cases (id) on delete cascade,
  rank integer not null,
  hypothesis text not null,
  confidence_level text not null check (confidence_level in ('high', 'medium', 'low', 'insufficient_evidence')),
  reasoning text not null,
  evidence_strength text not null default 'weak' check (evidence_strength in ('strong', 'moderate', 'weak')),
  supporting_evidence_ids uuid[] not null default '{}',
  missing_evidence text[] not null default '{}',
  required_tests text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists diagnostic_probabilities_case_id_idx on diagnostic_probabilities (case_id, rank);

create table if not exists repair_verifications (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references scan_cases (id) on delete cascade,
  checklist jsonb not null default '[]',
  generated_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists repair_verifications_case_id_idx on repair_verifications (case_id);

alter table diagnostic_evidence enable row level security;
alter table diagnostic_graph enable row level security;
alter table diagnostic_questions enable row level security;
alter table diagnostic_answers enable row level security;
alter table diagnostic_probabilities enable row level security;
alter table repair_verifications enable row level security;

drop policy if exists diagnostic_evidence_owner_read on diagnostic_evidence;
create policy diagnostic_evidence_owner_read on diagnostic_evidence
  for select using (exists (select 1 from scan_cases c where c.id = case_id and c.user_id = auth.uid()));

drop policy if exists diagnostic_graph_owner_read on diagnostic_graph;
create policy diagnostic_graph_owner_read on diagnostic_graph
  for select using (exists (select 1 from scan_cases c where c.id = case_id and c.user_id = auth.uid()));

drop policy if exists diagnostic_questions_owner_read on diagnostic_questions;
create policy diagnostic_questions_owner_read on diagnostic_questions
  for select using (exists (select 1 from scan_cases c where c.id = case_id and c.user_id = auth.uid()));

drop policy if exists diagnostic_answers_owner_read on diagnostic_answers;
create policy diagnostic_answers_owner_read on diagnostic_answers
  for select using (exists (select 1 from scan_cases c where c.id = case_id and c.user_id = auth.uid()));

drop policy if exists diagnostic_probabilities_owner_read on diagnostic_probabilities;
create policy diagnostic_probabilities_owner_read on diagnostic_probabilities
  for select using (exists (select 1 from scan_cases c where c.id = case_id and c.user_id = auth.uid()));

drop policy if exists repair_verifications_owner_read on repair_verifications;
create policy repair_verifications_owner_read on repair_verifications
  for select using (exists (select 1 from scan_cases c where c.id = case_id and c.user_id = auth.uid()));
