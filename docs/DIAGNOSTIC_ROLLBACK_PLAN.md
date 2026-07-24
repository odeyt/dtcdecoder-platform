# Diagnostic Rollback Plan

Two independent things can be rolled back separately: the **application code** (git) and the **database migration** (SQL). Neither rollback requires the other.

## Rolling back the application code

Standard git revert, since this was built on its own branch (`feature/diagnostic-safety-v2`) and merged as a single, self-contained commit:

```bash
git revert <merge-commit-sha>
git push origin main
```

This restores the previous `probabilityPercent`/raw-`%` behavior in code. It does **not** need the database migration to be rolled back — the old code path only ever wrote `schema_version: null`/didn't reference the new columns, and reading them isn't required by the old code either (the new columns are simply additive and the old code never queries them). The one thing to check after a code rollback: any `scan_reports` rows written *while v2 code was live* will have `schema_version: "2.0"` and a real `confidence_level` — the reverted (old) `ScanReportView.tsx` would render these using its old logic (`{report.confidence}%`), which still works since the deprecated numeric `confidence` column was never removed. No crash, just a reversion to the old (less safe) display for those specific rows.

## Rolling back the database migration (`0015`)

Only needed if you want the new columns gone entirely, not just unused. This is optional — leaving the columns in place after a code-only rollback is harmless (nothing but the new code reads them).

```sql
alter table scan_ai_runs drop column if exists prompt_version;
alter table scan_reports drop column if exists confidence_level;
alter table scan_reports drop column if exists schema_version;
```

This is destructive to those three columns' data specifically (not to `ranked_causes`, `confidence`, or anything else — those are untouched by migration `0015` and unaffected by this rollback). Per this project's standing rule, **do not run this without explicit approval**, and confirm no other process depends on these columns first (a quick check: `grep -rn "confidence_level\|schema_version\|prompt_version" src/`).

## Rolling back the feature flag (fastest option, no deploy needed)

If the concern is specifically about the AI output shape (not wanting v2 prompt behavior live) rather than the code itself, the fastest reversible lever is `NEXT_PUBLIC_SCAN_DIAGNOSTICS_ENABLED` — setting it to `false` in the relevant Vercel environment immediately takes the entire scan-diagnostics feature (both old and new behavior) out of the live site on the next deploy, without any code or database change. This is the safest first response if something looks wrong in production, before reaching for a git revert or SQL rollback.

## What triggers using this plan

- A production incident traced to the new prompt/schema (e.g. Claude producing malformed `confidenceLevel` values the schema rejects at a higher rate than expected, or the categorical banding producing confusing results for real cases).
- A decision to redesign the confidence-level UX further before it's proven out with real usage.

## What does NOT require rollback

- A single malformed AI response — already handled gracefully by `AiResponseValidationError` (the case moves to `failed`, the user can retry, no crash, no double-charge).
- A legacy (`schema_version "1.0"`) report rendering "Not established" — this is the intended, correct behavior for old data, not a bug.
