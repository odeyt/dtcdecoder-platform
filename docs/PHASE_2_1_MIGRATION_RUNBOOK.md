# Phase 2.1 — Migration Runbook (0030, 0031)

> **PRODUCTION WARNING**: this repo has exactly one configured Supabase project
> (`NEXT_PUBLIC_SUPABASE_URL` in `.env.local`) — there is no separate staging project on file, and
> a Supabase project ref is a random string with no "staging"/"production" naming signal to check
> programmatically. Per this phase's explicit instruction, **migrations are not applied
> automatically under any circumstance in this pass.** Everything below is written for the
> project owner to run manually (SQL editor or `psql`), after confirming for themselves which
> project they're connected to. If a genuinely separate staging project is created later, this
> same runbook applies to it unchanged.

## Order

Run in numeric order — `0030` then `0031`. They touch disjoint objects
(`analytics_events` vs. six new `diagnostic_*` tables) so order between them has no functional
dependency, but this repo's convention is strictly sequential migration numbers, and skipping
ahead makes future `schema_migrations` bookkeeping harder to reason about.

## Preflight (run first, read-only)

```sql
-- Confirm scan_cases exists and has the expected shape (0031's FK target).
select count(*) from information_schema.tables where table_name = 'scan_cases';

-- Confirm neither 0030 nor 0031 has already been applied (idempotency check —
-- if these come back non-empty, STOP and diff against the migration file
-- before re-running anything).
select conname from pg_constraint where conname = 'analytics_events_event_type_check';
select table_name from information_schema.tables
  where table_name in (
    'diagnostic_evidence', 'diagnostic_graph', 'diagnostic_questions',
    'diagnostic_answers', 'diagnostic_probabilities', 'repair_verifications'
  );

-- Row count sanity check before touching analytics_events (0030 only ALTERs
-- a constraint, never touches rows, but confirm nothing unexpected is present).
select event_type, count(*) from analytics_events group by 1 order by 2 desc;
```

## Migration 0030 — `analytics_events` event-type widening

**What it does:** `alter table ... drop constraint analytics_events_event_type_check` then
`add constraint ... check (event_type in (...))` with the original 8 values plus 11 new Phase 1
funnel event names. No new column, no new table, no row touched.

**Idempotency:** NOT idempotent as written (`drop constraint` on a constraint that doesn't exist
throws). Safe to run exactly once. If it's already been applied (see preflight query above), skip
it — do not re-run.

**Destructiveness:** None. A narrower constraint would have rejected inserts of the new event
types; widening it can never reject a row that was previously accepted. Existing rows are
unaffected (their `event_type` values are already in both the old and new allowed sets).

**Compatibility with production data:** Fully compatible — this is the least risky kind of
migration in the entire codebase (a single constraint alter, no data migration).

**Command:**

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/0030_phase1_analytics_events.sql
```

or paste the file contents directly into the Supabase SQL editor.

**Post-migration validation:**

```sql
-- Confirm the new constraint accepts a Phase 1 event type.
insert into analytics_events (event_type, metadata) values ('dtc_technician_opened', '{}'::jsonb);
select * from analytics_events where event_type = 'dtc_technician_opened' order by created_at desc limit 1;
delete from analytics_events where event_type = 'dtc_technician_opened' and metadata = '{}'::jsonb;
```

**Rollback:** Re-run the `drop constraint` / `add constraint check (... original 8 values ...)`
pair from migration 0027 to revert. Only necessary if a bug is found in the constraint list
itself — there is no data to roll back.

## Migration 0031 — Diagnostic Engine core schema

**What it does:** Adds six new tables (`diagnostic_evidence`, `diagnostic_graph`,
`diagnostic_questions`, `diagnostic_answers`, `diagnostic_probabilities`,
`repair_verifications`), each `case_id uuid not null references scan_cases (id) on delete
cascade`, plus indexes and owner-read RLS policies. No existing table, column, or row is touched.

**Idempotency:** NOT idempotent as written (`create table` fails if the table already exists).
Safe to run exactly once per environment. Re-running after a partial failure requires manually
dropping whichever tables/indexes/policies were created before the failure, or wrapping the whole
file in a single transaction (Supabase's SQL editor runs each statement individually by default —
consider wrapping in `begin; ... commit;` when running via `psql` so a mid-file failure leaves
nothing half-created).

**Destructiveness:** None — purely additive. `on delete cascade` means deleting a `scan_cases` row
cascades to delete its Phase 2 rows too, which is the same cascade behavior already used by
`scan_extractions`/`scan_dtc_records` in migration 0012 — consistent, not a new risk.

**Compatibility with production data:** Fully compatible. Every new table's only foreign key is to
`scan_cases.id`, which already exists in every environment that has run migration 0012. No
production `scan_cases` row needs backfilling — Phase 2 tables start empty and are populated
lazily per-case on that case's first Diagnostic Engine turn.

**RLS:** All six tables get `alter table ... enable row level security` plus one
`for select using (exists (select 1 from scan_cases c where c.id = case_id and c.user_id =
auth.uid()))` policy each — matches the existing `scan_systems`/`scan_patterns` pattern exactly
(migration 0028). See [PHASE_2_1_RLS_SECURITY.md](PHASE_2_1_RLS_SECURITY.md) for why this only
covers reads, not writes, and what actually enforces ownership on the write path.

**Indexes:** `diagnostic_evidence(case_id)` + `(case_id, evidence_type)`;
`diagnostic_graph(case_id)` **unique** (one current-state row per case);
`diagnostic_questions(case_id, sequence)`; `diagnostic_answers(question_id)` unique +
`(case_id)`; `diagnostic_probabilities(case_id, rank)`; `repair_verifications(case_id)`
(deliberately non-unique — see [TEST_PLANNER.md](TEST_PLANNER.md), a case can have more than one
repair-verification attempt over time). All match the query patterns the application code
actually issues (every read filters by `case_id` first).

**Command:**

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/0031_diagnostic_engine_core.sql
```

**Post-migration validation:**

```sql
-- Tables exist.
select table_name from information_schema.tables
  where table_name in (
    'diagnostic_evidence', 'diagnostic_graph', 'diagnostic_questions',
    'diagnostic_answers', 'diagnostic_probabilities', 'repair_verifications'
  )
  order by table_name;
-- Expect 6 rows.

-- RLS is enabled on all six.
select relname, relrowsecurity from pg_class
  where relname in (
    'diagnostic_evidence', 'diagnostic_graph', 'diagnostic_questions',
    'diagnostic_answers', 'diagnostic_probabilities', 'repair_verifications'
  );
-- Expect relrowsecurity = true for all six.

-- Policies exist (one owner-read policy per table).
select tablename, policyname from pg_policies where tablename in (
  'diagnostic_evidence', 'diagnostic_graph', 'diagnostic_questions',
  'diagnostic_answers', 'diagnostic_probabilities', 'repair_verifications'
);
-- Expect 6 rows, one per table.

-- Indexes exist.
select tablename, indexname from pg_indexes where tablename in (
  'diagnostic_evidence', 'diagnostic_graph', 'diagnostic_questions',
  'diagnostic_answers', 'diagnostic_probabilities', 'repair_verifications'
) order by tablename;

-- FK to scan_cases resolves correctly end to end (requires one real scan_cases
-- row — substitute a real id from your own environment, never a synthetic one
-- in production).
-- select id from scan_cases limit 1;
-- insert into diagnostic_evidence (case_id, evidence_type, value, source, confidence)
--   values ('<real-case-id>', 'complaint', '"test"'::jsonb, 'user_reported', 'high');
-- select * from diagnostic_evidence where case_id = '<real-case-id>';
-- delete from diagnostic_evidence where case_id = '<real-case-id>' and value = '"test"'::jsonb;
```

**Rollback:** Purely additive with no data to lose, so rollback is a straightforward drop, in
reverse dependency order (children before the tables nothing else references):

```sql
drop table if exists repair_verifications;
drop table if exists diagnostic_probabilities;
drop table if exists diagnostic_answers;
drop table if exists diagnostic_questions;
drop table if exists diagnostic_graph;
drop table if exists diagnostic_evidence;
```

Safe at any time before or after application code that reads these tables is deployed — every
Phase 2/2.1 read path already handles "table has zero rows for this case" as the normal
first-turn state (`getEvidenceForCase` etc. all return `[]`/`null`, never throw, when nothing
exists yet). The only requirement is that no `DIAGNOSTIC_ENGINE_FLAGS` are `true` in any
environment where the tables have been dropped — with the flags on and the tables gone, calls
would fail with a Postgres "relation does not exist" error rather than a handled empty state.

## Summary checklist before running either migration for real

- [ ] Confirm which Supabase project `SUPABASE_DB_URL` / the SQL editor is actually pointed at.
- [ ] Run the preflight queries above; stop if either migration's constraint/tables already exist.
- [ ] Take a snapshot/backup per your existing Supabase project's backup policy (routine
      precaution, not because this migration is destructive).
- [ ] Run 0030, then its post-migration validation.
- [ ] Run 0031, then its post-migration validation.
- [ ] Leave all six `DIAGNOSTIC_ENGINE_FLAGS` at their default (`false`/unset) until the rest of
      Phase 2.1 (entitlements, RLS fix, observability) is deployed — the tables existing does not
      by itself expose any new behavior to any user.
