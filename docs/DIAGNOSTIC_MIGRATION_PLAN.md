# Diagnostic Migration Plan

Covers `supabase/migrations/0015_diagnostic_safety_v2.sql` — how it applies, how it's safe, and what future (not-yet-executed) migration work it sets up.

## What this migration does

Purely additive:

```sql
alter table scan_reports
  add column schema_version text,
  add column confidence_level text check (...);

update scan_reports set schema_version = '1.0' where schema_version is null;

alter table scan_reports
  alter column schema_version set default '2.0',
  alter column schema_version set not null;

alter table scan_ai_runs
  add column prompt_version text;
```

No `drop column`, no `delete`, no data rewritten beyond the one-time `schema_version` backfill (which only ever writes the literal string `'1.0'` into a brand-new column — it cannot corrupt or lose any existing value).

## Why the backfill is safe

Any `scan_reports` row that exists *at the moment this migration runs* was necessarily written by the pre-v2 code path (v2 code didn't exist yet), so tagging it `'1.0'` is a statement of fact, not a guess. Rows inserted after this migration runs always come from the updated `report.ts`, which explicitly sets `schema_version: "2.0"` — the column's `default '2.0'` is a safety net for that path, not the primary mechanism.

## Order of operations for applying this migration

Same process used for every migration in this repo (see `docs/SCAN_REPORT_ANALYSIS.md`): run via Supabase CLI (`supabase db push`) or paste into the Supabase SQL Editor, in numeric order. This migration depends on `0012`/`0013` (the `scan_reports`/`scan_ai_runs` tables) already existing — it will fail cleanly with "relation does not exist" if run out of order, not corrupt anything.

**Given this project's Preview and Production environments share one Supabase project** (see `docs/DIAGNOSTIC_AI_AUDIT.md`), there is only one place to apply this — there's no separate staging database to test it against first. Recommended sequence:
1. Read-only check beforehand: `select count(*) from scan_reports;` — know how many (if any) legacy rows exist before migrating.
2. Apply the migration.
3. Read-only check after: `select schema_version, count(*) from scan_reports group by schema_version;` — confirm every pre-existing row landed on `'1.0'` and none are unexpectedly `'2.0'` yet.

## Future migration (not executed now)

Per Phase 8 of the original request: **do not drop the deprecated `scan_reports.confidence` / `scan_ai_runs.confidence` numeric columns in this phase.** They remain useful for audit/debug and there is no urgency to remove them. If/when removal is ever warranted:

1. Confirm (via a fresh audit query) that zero application code paths still read `scan_reports.confidence` or `scan_ai_runs.confidence` directly (only `report-presentation.ts` and `report.ts`/`analyze.ts`'s write paths should reference them, and only as deprecated/debug).
2. Write a new, separately-reviewed migration that drops the columns — never bundle a destructive `drop column` into an otherwise-additive migration.
3. Get explicit approval before executing it, per this project's standing rule that no destructive SQL runs without explicit approval and a tested rollback.

This is a plan, not an action — nothing in Phase 8 of this pass drops any column.
