# Production Verification — Diagnostic Safety v2

Status as of this writing: **preview build verified, migration `0015` applied and verified against the real (shared) Supabase database, production code deployment NOT yet authorized.** This document will be updated once the remaining items below are completed and production deployment is explicitly authorized.

## 1. Local verification (completed)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ Clean |
| `npm run lint` | ✅ Clean |
| `npx vitest run` | ✅ 142/142 tests passing (21 test files) |
| `npm run build` | ✅ Succeeds, all routes compile including all `/api/scan-diagnostics/*` and `/diagnostics/*` |

## 2. Git state

| Field | Value |
|---|---|
| Branch | `feature/diagnostic-safety-v2` |
| HEAD commit | `44aaa6fa868a8b08b5740056aceb6d52107c039b` |
| Working tree | Clean |
| Pushed to origin | Yes |

## 3. Preview deployment

| Field | Value |
|---|---|
| URL | `https://dtcdecoder-nzlhck27k-redlined1-s-projects.vercel.app` |
| Build status | ✅ Ready (34s build) |
| Preview env flag | `NEXT_PUBLIC_SCAN_DIAGNOSTICS_ENABLED=true`, scoped to this branch's Preview only |
| Visual/manual verification | **Blocked** by Vercel's Deployment Protection (SSO login wall) — the automated browser tool has no Vercel session to authenticate through. Not a defect; the account owner (already authenticated) can verify directly. |

## 4. Migration `0015` — applied and verified

Applied directly to the shared Supabase database (same one Preview and Production both use) on the same one-at-a-time, present-then-confirm basis as migrations `0012`–`0014`. All four read-only verification queries confirmed:

| Check | Result |
|---|---|
| `scan_reports.schema_version` | `text`, `NOT NULL`, default `'2.0'::text` ✅ |
| `scan_reports.confidence_level` | `text`, nullable, no default ✅ |
| `scan_reports_confidence_level_check` constraint | `CHECK (confidence_level IS NULL OR confidence_level = ANY (...))` ✅ |
| `scan_ai_runs.prompt_version` | `text`, nullable ✅ |
| `scan_reports` row distribution | **Table is completely empty** — zero rows of any schema_version. No legacy data to reconcile, and nothing was mislabeled. |

### A transition-window subtlety (considered, not a bug)

Between the migration landing and the *code* being merged to `main`, production is running old (`pre-v2`) code against a database that now has the new columns. If a real analysis had run in that window, the old code's insert wouldn't set `schema_version` explicitly, so it would pick up the column default (`'2.0'`) — while still writing old-shaped JSON (`probabilityPercent`, no `confidenceLevel`). That row would be *mislabeled* as v2 despite being v1-shaped data.

This turns out to be harmless by construction: `isLegacyReport()` (`report-presentation.ts`) checks `schema_version === "1.0" || !confidence_level` — old code never sets `confidence_level` either, so the second condition catches it regardless of what `schema_version` ends up being. The UI would still correctly render "Not established" rather than misrepresenting old data as calibrated v2 output. Moot in any case here, since `scan_reports` is confirmed empty — no such row was ever created.

## 5. What's still needed before production code deployment

1. **Merge `feature/diagnostic-safety-v2` into `main`** (the database is now ready for it — this was the blocking dependency).
2. A live run through production of: upload a synthetic scan report → extract → review → analyze → view the report (confirm categorical badges render, no `%` appears, "Fault code categories" shows `not_stated` correctly) → submit feedback.
3. Mobile-viewport check of the report page.
4. Confirm the usage counter increments exactly once even if `/analyze` is retried after a failure (already covered by unit tests; a live confirmation would corroborate it against the real ledger).

## 6. Production deployment status

**Code not yet merged or deployed.** Database migration is complete and verified. Per Phase 9's explicit instruction and this session's established practice, merging to `main` (which auto-deploys to production) remains a separate, deliberate step — waiting on your go-ahead.
