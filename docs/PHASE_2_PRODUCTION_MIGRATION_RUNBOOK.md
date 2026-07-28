# Phase 2 — Production Migration Runbook (Direct-to-Production Release)

Target database: Supabase project `sysbwmiguyxwzufwxwpq` — confirmed by the project owner to be
the real production project backing dtcdecoder.com. Execution method: the project owner pastes
the SQL below into the Supabase Dashboard SQL Editor and runs it — there is no CLI or direct
database connection available to run this automatically, consistent with how every prior migration
in this project has been applied.

All six migration files below were rewritten to be **idempotent** before this runbook was written
(`git diff` on `supabase/migrations/003{0,1,2,3,4,5}*.sql` shows the exact changes): every `CREATE
TABLE`/`CREATE INDEX` uses `IF NOT EXISTS`, every constraint swap uses `DROP CONSTRAINT IF EXISTS`
before an unconditional `ADD CONSTRAINT`, every function definition already used (or now uses)
`CREATE OR REPLACE`, and every policy is preceded by `DROP POLICY IF EXISTS` (Postgres has no
`CREATE POLICY IF NOT EXISTS`). Rerunning any of these files after a partial or full prior
application converges to the same end state without erroring or corrupting data.

## Step 0 — Preflight: read-only schema introspection

Run [PHASE_2_PRODUCTION_PREFLIGHT_INTROSPECTION.sql](PHASE_2_PRODUCTION_PREFLIGHT_INTROSPECTION.sql)
in the SQL Editor first. It is entirely `SELECT`-only — it cannot modify anything. It answers, with
certainty (unlike a REST-based probe, which cannot see constraint definitions or RLS policy
content):

- Which of the 8 new tables (from 0031/0032/0033) already exist.
- Whether `diagnostic_engine_runs` already has the 0035 columns.
- The exact current text of the `analytics_events` and `diagnostic_evidence` check constraints.
- RLS-enabled state and existing policy list for every new table.
- Existing indexes for every new table.
- Whether the two 0032 functions already exist.
- Row counts for `scan_cases`, `ai_diagnostic_usage`, `analytics_events`, `ai_routing_decisions` —
  record these numbers now; they must be unchanged (never decrease) after every step below.

**Baseline actually recorded (owner ran this in the production SQL Editor)**: `scan_cases = 4`,
`ai_diagnostic_usage = 5`, `analytics_events = 40`, `ai_routing_decisions = 0`. These four numbers
must be identical after Step 2's migrations are applied — Step 3 checks this explicitly.

A separate read-only REST probe (using the app's own service-role key, run from this session) was
already performed against this same project and found: `analytics_events`, `ai_diagnostic_usage`,
and `ai_routing_decisions` exist (migrations 0001–0029 baseline); `diagnostic_evidence`,
`diagnostic_graph`, `diagnostic_questions`, `diagnostic_answers`, `diagnostic_probabilities`,
`repair_verifications`, `diagnostic_engine_usage`, and `diagnostic_engine_runs` do **not** exist —
meaning 0031, 0032, and 0033 are pending. Whether 0030's widened `analytics_events` constraint is
already live could not be determined via REST (constraint text isn't exposed by PostgREST); Step 0
resolves that with certainty before anything is applied. Because every migration below is
idempotent, this uncertainty does not block anything — running 0030 again is safe even if it was
already applied.

## Step 1 — Backup / recovery posture

Before running any `ALTER`/`CREATE`: in the Supabase Dashboard, open **Database → Backups** and
confirm Point-in-Time-Recovery (or at minimum daily backups) is active, and note the latest
available recovery point/timestamp. This session has no dashboard access and cannot confirm this
directly — the project owner must check and record it before proceeding. **Do not proceed past
Step 2 until this is confirmed**, per the phase brief's own instruction not to claim rollback is
possible unless a real recovery method exists.

No schema-only export tool is available in this environment (no Supabase CLI credential — see
[docs/PHASE_2_3_ENV_SEPARATION.md](PHASE_2_3_ENV_SEPARATION.md)). The Dashboard's own
backup/PITR system is the actual recovery mechanism for this release, not a file this session can
produce.

## Step 2 — Apply migrations, in exact numerical order

Run each file's full contents, one at a time, waiting for success before the next:

1. `supabase/migrations/0030_phase1_analytics_events.sql` — widens `analytics_events`'s
   `event_type` check constraint from 8 values to 20. **Impact**: brief `ACCESS EXCLUSIVE` lock on
   `analytics_events` while the constraint is dropped and re-added (Postgres validates the new
   constraint against every existing row during `ADD CONSTRAINT`; lock duration scales with current
   row count — for this table's expected volume, sub-second). No column/row change.
2. `supabase/migrations/0031_diagnostic_engine_core.sql` — creates 6 new tables
   (`diagnostic_evidence`, `diagnostic_graph`, `diagnostic_questions`, `diagnostic_answers`,
   `diagnostic_probabilities`, `repair_verifications`), their indexes, RLS, and owner-read policies.
   **Impact**: none on existing tables — pure additive `CREATE TABLE`. No lock on `scan_cases`
   beyond the instant FK-reference validation at table-creation time (irrelevant to existing rows).
3. `supabase/migrations/0032_diagnostic_engine_entitlements.sql` — creates
   `diagnostic_engine_usage`, its indexes, RLS/policy, and the two RPC functions. **Impact**: none
   on existing tables.
4. `supabase/migrations/0033_diagnostic_engine_observability.sql` — creates
   `diagnostic_engine_runs`, its indexes, RLS/policy. **Impact**: none on existing tables. Depends
   on `scan_cases` (FK) — already present.
5. `supabase/migrations/0034_diagnostic_engine_hv_safety.sql` — widens
   `diagnostic_evidence.evidence_type` check constraint to add `'hv_safety_hazard'`. **Depends on
   Step 2 item 2** (table must exist first). **Impact**: brief lock on `diagnostic_evidence`, which
   has zero rows before this release, so re-validation is instant.
6. `supabase/migrations/0035_diagnostic_engine_budget_guardrails.sql` — adds 5 columns to
   `diagnostic_engine_runs` (all nullable or defaulted, all `ADD COLUMN IF NOT EXISTS`) plus one
   partial index. **Depends on Step 2 item 4** (table must exist first). **Impact**: adding a
   `boolean not null default false` column to a freshly-created, empty table is instant — no
   existing-row rewrite concern since there are no existing rows yet at first application.

**Stop immediately if any statement in any file errors.** Do not proceed to the next file. Do not
edit the database by hand to force success. Re-run Step 0's introspection query for the affected
table to see the actual state, diagnose from that, and only continue once the cause is understood
and fixed at the source (a corrected migration file), never worked around live.

## Step 3 — Post-migration verification

Re-run [PHASE_2_PRODUCTION_PREFLIGHT_INTROSPECTION.sql](PHASE_2_PRODUCTION_PREFLIGHT_INTROSPECTION.sql)
in full. Confirm:

- Query 1 now returns all 8 table names.
- Query 2 shows all 5 of the 0035 columns on `diagnostic_engine_runs`.
- Query 3's `analytics_events` constraint definition contains all 20 event-type values.
- Query 4's `diagnostic_evidence` constraint definition contains `hv_safety_hazard`.
- Query 5 shows `rls_enabled = true` for all 8 tables.
- Query 6 shows exactly one owner-read `SELECT` policy per table (6 `..._owner_read` policies plus
  the 2 usage/runs `..._owner_read` policies — 8 total), each with a `using` expression referencing
  `auth.uid()`.
- Query 7 shows the expected index list (case_id/type/version/sequence/request indexes per table,
  matching each migration file's own `CREATE INDEX` statements).
- Query 8 shows both `record_diagnostic_engine_usage` and `get_diagnostic_engine_usage_summary`.
- Query 9's row counts for `scan_cases`, `ai_diagnostic_usage`, `analytics_events`, and
  `ai_routing_decisions` are **unchanged** from the Step 0 baseline (proves no row was touched or
  lost in any pre-existing table).

Then, from the running application (or a quick script against the same project), confirm existing
DTC lookup and diagnostic-case read operations still function — e.g. load an existing scan case
and confirm its data still renders, proving the new FKs/tables didn't break anything already live.

## Rollback / forward-fix strategy

**Rollback SQL is provided for the exact objects this release adds** — safe because every object
here is new (no existing table/column/constraint is dropped or altered destructively; only two
constraints are *widened*, and widening back down is the only genuinely destructive direction,
covered separately below):

```sql
-- Reverse order: 0035, then 0034, then 0033, then 0032, then 0031, then 0030.
alter table diagnostic_engine_runs
  drop column if exists is_internal,
  drop column if exists model_id,
  drop column if exists estimated_cost_usd_preflight,
  drop column if exists cached_input_tokens,
  drop column if exists blocked_budget_scope;
drop index if exists diagnostic_engine_runs_internal_created_idx;

-- 0034: reverts diagnostic_evidence's constraint to the pre-hv_safety_hazard list.
-- ONLY safe if no row has evidence_type = 'hv_safety_hazard' yet — check first:
--   select count(*) from diagnostic_evidence where evidence_type = 'hv_safety_hazard';
alter table diagnostic_evidence drop constraint if exists diagnostic_evidence_evidence_type_check;
alter table diagnostic_evidence add constraint diagnostic_evidence_evidence_type_check
  check (evidence_type in (
    'vin', 'vehicle', 'engine', 'transmission', 'mileage',
    'complaint', 'symptom', 'dtc_stored', 'dtc_pending', 'dtc_permanent',
    'freeze_frame', 'live_data', 'previous_repair', 'known_repair',
    'technician_note', 'safety_issue', 'environmental_condition',
    'question_answer', 'other'
  ));

drop table if exists diagnostic_engine_runs;
drop function if exists get_diagnostic_engine_usage_summary(uuid, text);
drop function if exists record_diagnostic_engine_usage(uuid, text, text, text, text, integer, integer);
drop table if exists diagnostic_engine_usage;
drop table if exists repair_verifications;
drop table if exists diagnostic_probabilities;
drop table if exists diagnostic_answers;
drop table if exists diagnostic_questions;
drop table if exists diagnostic_graph;
drop table if exists diagnostic_evidence;

-- 0030: reverts analytics_events to the pre-Phase-1 8-value list.
-- ONLY safe if no row uses one of the 12 Phase-1 event types added by 0030 — check first:
--   select count(*) from analytics_events where event_type not in (
--     'basic_dtc_search','unknown_dtc_search','ai_diagnosis_cta_viewed',
--     'ai_diagnosis_cta_clicked','ai_diagnosis_started','ai_diagnosis_completed',
--     'ai_diagnosis_failed','upgrade_prompt_viewed');
alter table analytics_events drop constraint if exists analytics_events_event_type_check;
alter table analytics_events add constraint analytics_events_event_type_check
  check (event_type in (
    'basic_dtc_search', 'unknown_dtc_search', 'ai_diagnosis_cta_viewed',
    'ai_diagnosis_cta_clicked', 'ai_diagnosis_started', 'ai_diagnosis_completed',
    'ai_diagnosis_failed', 'upgrade_prompt_viewed'
  ));
```

**Preferred recovery path over the above**: since the Diagnostic Engine stays fully behind
`DIAGNOSTIC_ENGINE_ROLLOUT_TIER=disabled` and every per-module flag off after this release (Step 9
of the release plan), a schema-level problem discovered after deployment does not need an emergency
rollback at all — set `DIAGNOSTIC_ENGINE_PROVIDER_KILL_SWITCH=true` and/or
`DIAGNOSTIC_ENGINE_ROLLOUT_TIER=disabled` (already the default) to stop all traffic to the new code
paths instantly, without touching the database, then fix forward. The SQL rollback above exists for
completeness and for the rare case a constraint itself is the problem, not as the first response.

## Release-blocking conditions

Do not proceed past Step 2 (or continue to the next file within Step 2) if any of:

- Step 1's backup/PITR confirmation is not obtained.
- Any migration statement errors.
- Step 3's row-count check shows any pre-existing table's count decreased.
- Step 3's constraint/RLS/policy/index verification doesn't match what each migration file
  declares.
- Existing DTC lookup or diagnostic-case read operations stop working after migration.
