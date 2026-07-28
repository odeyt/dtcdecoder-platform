# Phase 2.2 — Staging Migration Runbook

> **PRODUCTION WARNING** (unchanged from [PHASE_2_1_MIGRATION_RUNBOOK.md](PHASE_2_1_MIGRATION_RUNBOOK.md)):
> this repo has exactly one configured Supabase project on file — there is no separate staging
> project, and a project ref has no "staging"/"production" naming signal to check
> programmatically. **No migration is applied automatically in this pass, under any
> circumstance.** Everything below is written for the project owner to run manually, against a
> project they have personally confirmed is non-production, before any internal staging
> activation.

## Exact migration order

Six migrations, strictly sequential (each numbered file assumes everything before it has already
run):

| # | File | What it adds | Applied elsewhere before? |
|---|---|---|---|
| 1 | `0030_phase1_analytics_events.sql` | Widens `analytics_events.event_type` (constraint alter only) | No |
| 2 | `0031_diagnostic_engine_core.sql` | 6 tables: evidence/graph/questions/answers/probabilities/repair-verifications | No |
| 3 | `0032_diagnostic_engine_entitlements.sql` | `diagnostic_engine_usage` table + RPCs (turn-count ledger) | No |
| 4 | `0033_diagnostic_engine_observability.sql` | `diagnostic_engine_runs` table (cost/observability log) | No |
| 5 | `0034_diagnostic_engine_hv_safety.sql` | Widens `diagnostic_evidence.evidence_type` to add `hv_safety_hazard` | No |
| 6 | `0035_diagnostic_engine_budget_guardrails.sql` | Adds `is_internal`, `model_id`, `estimated_cost_usd_preflight`, `cached_input_tokens`, `blocked_budget_scope` to `diagnostic_engine_runs` | No |

(The phase brief's Step 9 lists `0032_diagnostic_engine_usage.sql`/`0033_diagnostic_engine_runs.sql`
as placeholder names — the actual files created during Phase 2.1/2.2 are
`0032_diagnostic_engine_entitlements.sql`/`0033_diagnostic_engine_observability.sql`; this table
uses the real filenames.)

All six are purely additive — no existing table, column, row, or constraint from migrations
0001–0029 is touched. 0032–0035 each depend on 0031 already having run (they reference or extend
`diagnostic_evidence`/tables it creates); 0035 depends on 0033 (it `alter table`s
`diagnostic_engine_runs`).

## Preflight (run first, read-only)

```sql
-- Confirm the migration chain's prerequisite exists.
select count(*) from information_schema.tables where table_name = 'scan_cases';

-- Confirm none of these six have already been applied — if any of these
-- come back non-empty, STOP and diff against the actual migration files
-- before re-running anything.
select conname from pg_constraint where conname = 'analytics_events_event_type_check';
select table_name from information_schema.tables where table_name in (
  'diagnostic_evidence', 'diagnostic_graph', 'diagnostic_questions', 'diagnostic_answers',
  'diagnostic_probabilities', 'repair_verifications', 'diagnostic_engine_usage', 'diagnostic_engine_runs'
);
select column_name from information_schema.columns
  where table_name = 'diagnostic_engine_runs' and column_name in ('is_internal', 'model_id');

-- Row-count baseline (record these numbers — compared against "expected
-- row counts" after each migration below; all of them should be 0 since
-- these tables don't exist yet on a project that hasn't run any of this
-- chain).
```

## Backup recommendation

Take a snapshot per the target Supabase project's existing backup policy before running any of
this — routine precaution, not because any of these six migrations is individually destructive
(none of them are: every one is `create table`, `alter table ... add column`, or a constraint
widen). The reason to snapshot anyway is that this is six migrations run in one sitting, and a
snapshot makes "did anything about the *existing* schema change unexpectedly" trivially
verifiable afterward (it shouldn't have).

## Running each migration

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/0030_phase1_analytics_events.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/0031_diagnostic_engine_core.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/0032_diagnostic_engine_entitlements.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/0033_diagnostic_engine_observability.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/0034_diagnostic_engine_hv_safety.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/0035_diagnostic_engine_budget_guardrails.sql
```

Or paste each file's contents into the Supabase SQL editor, one at a time, in this order —
running them out of order will fail loudly (a later migration references an object an earlier one
creates), which is a safe failure mode, not a silent one.

`0030`/`0031` have their own detailed per-migration validation already written in
[PHASE_2_1_MIGRATION_RUNBOOK.md](PHASE_2_1_MIGRATION_RUNBOOK.md) — not repeated here. The
checks below cover the full chain end-to-end, including the four migrations added since then.

## Table verification (after all six)

```sql
select table_name from information_schema.tables where table_name in (
  'diagnostic_evidence', 'diagnostic_graph', 'diagnostic_questions', 'diagnostic_answers',
  'diagnostic_probabilities', 'repair_verifications', 'diagnostic_engine_usage', 'diagnostic_engine_runs'
) order by table_name;
-- Expect 8 rows.
```

## Constraint verification

```sql
-- diagnostic_evidence.evidence_type must include hv_safety_hazard (0034).
select pg_get_constraintdef(oid) from pg_constraint
  where conname = 'diagnostic_evidence_evidence_type_check';
-- Expect the value list to include 'hv_safety_hazard'.

-- diagnostic_engine_usage.feature / diagnostic_engine_runs.status check
-- constraints exist and are well-formed.
select conname, pg_get_constraintdef(oid) from pg_constraint
  where conrelid = 'diagnostic_engine_usage'::regclass or conrelid = 'diagnostic_engine_runs'::regclass;
```

## Index verification

```sql
select tablename, indexname from pg_indexes where tablename in (
  'diagnostic_evidence', 'diagnostic_graph', 'diagnostic_questions', 'diagnostic_answers',
  'diagnostic_probabilities', 'repair_verifications', 'diagnostic_engine_usage', 'diagnostic_engine_runs'
) order by tablename, indexname;
-- Confirm, in particular:
--   diagnostic_graph_case_id_idx is UNIQUE (one current-state row per case)
--   diagnostic_engine_usage_user_request_idx is UNIQUE (idempotency key)
--   diagnostic_answers_question_id_idx is UNIQUE (one answer per question)
--   diagnostic_engine_runs_internal_created_idx exists (0035, partial index on is_internal)
```

## RLS verification

```sql
select relname, relrowsecurity from pg_class where relname in (
  'diagnostic_evidence', 'diagnostic_graph', 'diagnostic_questions', 'diagnostic_answers',
  'diagnostic_probabilities', 'repair_verifications', 'diagnostic_engine_usage', 'diagnostic_engine_runs'
);
-- Expect relrowsecurity = true for all 8.

select tablename, policyname, cmd from pg_policies where tablename in (
  'diagnostic_evidence', 'diagnostic_graph', 'diagnostic_questions', 'diagnostic_answers',
  'diagnostic_probabilities', 'repair_verifications', 'diagnostic_engine_usage', 'diagnostic_engine_runs'
);
-- Expect exactly one policy per table, cmd = SELECT (owner-read-only —
-- see docs/PHASE_2_1_RLS_SECURITY.md for why writes are service-role-only
-- and RLS never needs an insert/update/delete policy here).
```

## Cross-user security SQL

These exercise RLS directly against Postgres (not the FakeSupabase mock the app's own test suite
uses — see the RLS security doc's note that automated app-level tests cannot exercise real RLS).
Run as two different **authenticated** roles (or via `set local role`/`request.jwt.claims`
impersonation in the SQL editor, matching however your Supabase project's local testing is set
up) — never as the service role, which bypasses RLS by design.

```sql
-- As user A: create a case, seed one evidence row for it (requires the
-- service-role path in the real app; for this test, insert directly as
-- service role to set up the fixture, then switch to anon/user-scoped
-- roles for the actual read checks below).

-- As user B (NOT the owner of the case just created): attempt to read
-- user A's evidence.
select * from diagnostic_evidence where case_id = '<user-A-case-id>';
-- Expect: zero rows returned (RLS silently filters, not an error) — user B
-- cannot see user A's evidence exists at all.

-- Same check across every one of the 6 case-scoped tables:
select * from diagnostic_graph where case_id = '<user-A-case-id>';
select * from diagnostic_questions where case_id = '<user-A-case-id>';
select * from diagnostic_answers where case_id = '<user-A-case-id>';
select * from diagnostic_probabilities where case_id = '<user-A-case-id>';
select * from repair_verifications where case_id = '<user-A-case-id>';

-- And the two user-scoped ledger tables:
select * from diagnostic_engine_usage where user_id = '<user-A-id>';
select * from diagnostic_engine_runs where user_id = '<user-A-id>';
-- Expect: zero rows for all of the above, when queried as user B.

-- As user A: the SAME queries must return their own rows.
select * from diagnostic_evidence where case_id = '<user-A-case-id>';
-- Expect: the rows actually exist for the case's real owner.
```

## Insert/update/delete checks

Since every write in this app goes through the service-role key from `server-only` code (never a
user's own session — see the RLS security doc), these checks confirm that a **non-service-role**
session cannot write at all, which is the actual security boundary for writes:

```sql
-- As user A's own (non-service-role) session, attempt a direct write —
-- must fail (no insert/update/delete policy exists on any of these
-- tables, so RLS denies by default).
insert into diagnostic_evidence (case_id, evidence_type, value, source, confidence)
  values ('<user-A-case-id>', 'complaint', '"test"'::jsonb, 'user_reported', 'high');
-- Expect: permission denied / row-level security policy violation.

update diagnostic_questions set answered = true where case_id = '<user-A-case-id>';
-- Expect: 0 rows affected (RLS filters the WHERE target to nothing visible
-- for UPDATE without a policy) or an explicit permission error, depending
-- on Postgres version/policy config — either way, no row is ever modified.
```

## Expected row counts after migration (before any application traffic)

All eight new/altered tables should have **zero rows** immediately after migration — none of
these migrations backfills or seeds data:

```sql
select
  (select count(*) from diagnostic_evidence) as evidence,
  (select count(*) from diagnostic_graph) as graph,
  (select count(*) from diagnostic_questions) as questions,
  (select count(*) from diagnostic_answers) as answers,
  (select count(*) from diagnostic_probabilities) as probabilities,
  (select count(*) from repair_verifications) as repair_verifications,
  (select count(*) from diagnostic_engine_usage) as usage,
  (select count(*) from diagnostic_engine_runs) as runs;
-- Expect all zero.
```

## Post-migration smoke test

With `DIAGNOSTIC_ENGINE_ROLLOUT_TIER=internal_only` and the relevant per-module flags on (see
[PHASE_2_2_RELEASE_READINESS.md](PHASE_2_2_RELEASE_READINESS.md) for the exact staging
configuration), as an allowlisted internal tester:

1. Create or open a diagnostic case.
2. Trigger one Guided Diagnosis turn (`POST /api/diagnostic-engine/v1/cases/[caseId]/turn`).
3. Confirm exactly one new row appears in `diagnostic_evidence` (or more, per the case's actual
   DTC/complaint content) with a `recorded_at` from just now.
4. Confirm one row in `diagnostic_engine_usage` for that `(user_id, request_id)`.
5. Confirm one row in `diagnostic_engine_runs` with `status = 'completed'`, non-null
   `estimated_cost_usd`, and a real `model_id`.
6. If the case's evidence includes an HV hazard DTC, confirm the row in `diagnostic_evidence` has
   `evidence_type = 'hv_safety_hazard'` and the turn response's `safety.status` is
   `immediate_stop`.
7. Answer the returned question (`POST /api/diagnostic-engine/v1/cases/[caseId]/answers`), confirm
   the `diagnostic_questions` row's `answered` flips to `true` and a `diagnostic_answers` row
   appears.
8. Run a second turn with no new evidence; confirm `diagnostic_engine_runs` gets a `status =
   'skipped'` row (cost optimization) rather than another `completed` one.

## Rollback / forward-fix procedure

Purely additive, so rollback is a straightforward reverse-order drop — no data to lose beyond
whatever staging traffic has accumulated since migration (acceptable to discard on a staging
project; **never run this against any project with real customer data** without independent
confirmation):

```sql
-- Reverse order (0035 down to 0030):
alter table diagnostic_engine_runs
  drop column if exists blocked_budget_scope,
  drop column if exists cached_input_tokens,
  drop column if exists estimated_cost_usd_preflight,
  drop column if exists model_id;
drop index if exists diagnostic_engine_runs_internal_created_idx;
alter table diagnostic_engine_runs drop column if exists is_internal;

alter table diagnostic_evidence drop constraint diagnostic_evidence_evidence_type_check;
alter table diagnostic_evidence add constraint diagnostic_evidence_evidence_type_check
  check (evidence_type in (
    'vin', 'vehicle', 'engine', 'transmission', 'mileage', 'complaint', 'symptom',
    'dtc_stored', 'dtc_pending', 'dtc_permanent', 'freeze_frame', 'live_data',
    'previous_repair', 'known_repair', 'technician_note', 'safety_issue',
    'environmental_condition', 'question_answer', 'other'
  )); -- reverts 0034, matching 0031's original constraint exactly

drop table if exists diagnostic_engine_runs;
drop table if exists diagnostic_engine_usage;

drop table if exists repair_verifications;
drop table if exists diagnostic_probabilities;
drop table if exists diagnostic_answers;
drop table if exists diagnostic_questions;
drop table if exists diagnostic_graph;
drop table if exists diagnostic_evidence;

-- 0030 revert: restore the pre-Phase-1 analytics_events constraint (only
-- necessary if reverting all the way — 0030 is independent of the rest of
-- this chain and safe to leave applied on its own).
alter table analytics_events drop constraint analytics_events_event_type_check;
alter table analytics_events add constraint analytics_events_event_type_check
  check (event_type in (
    'basic_dtc_search', 'unknown_dtc_search', 'ai_diagnosis_cta_viewed',
    'ai_diagnosis_cta_clicked', 'ai_diagnosis_started', 'ai_diagnosis_completed',
    'ai_diagnosis_failed', 'upgrade_prompt_viewed'
  ));
```

**Forward-fix is strongly preferred over rollback** once any real traffic has been recorded — a
bug found in, say, the budget-guard logic (application code) does not require rolling back the
schema at all; only fix and redeploy the code. Rollback is for the rare case where the *schema
itself* (not the code reading/writing it) needs to be undone.

## Checklist before running against a real (even staging) project

- [ ] Confirm which Supabase project `SUPABASE_DB_URL` / the SQL editor is actually pointed at.
- [ ] Run the preflight queries; stop if any of the six migrations' objects already exist.
- [ ] Take a snapshot per the project's existing backup policy.
- [ ] Run all six migrations in order; run their validation queries.
- [ ] Run the cross-user security SQL as two distinct non-service-role sessions.
- [ ] Run the insert/update/delete checks confirming non-service-role writes are denied.
- [ ] Confirm zero rows across all eight tables before any application traffic.
- [ ] Leave `DIAGNOSTIC_ENGINE_ROLLOUT_TIER` at `disabled` (or unset) until ready for the
      post-migration smoke test — the schema existing does not by itself expose any new behavior.
