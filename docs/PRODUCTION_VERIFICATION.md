# Production Verification — Diagnostic Safety v2

Status as of this writing: **preview build verified, production deployment NOT yet authorized.** This document will be updated once the remaining items below are completed and production deployment is explicitly authorized.

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

## 4. Full end-to-end workflow test — NOT YET PERFORMED, and why

Phase 9 calls for testing upload → extraction → diagnosis → saved report → mobile display → usage counter → error handling on preview. This was **not performed** for a specific, load-bearing reason:

**Migration `0015_diagnostic_safety_v2.sql` has not been applied to the actual Supabase database.** The new columns it adds (`scan_reports.schema_version`, `scan_reports.confidence_level`, `scan_ai_runs.prompt_version`) do not exist there yet. Since the application code now writes to those columns on every new analyze run, attempting a real analyze call against the current database would fail with a Postgres "column does not exist" error.

Compounding this: **Preview and Production share the same Supabase project** (established in `docs/DIAGNOSTIC_AI_AUDIT.md`) — there is no separate staging database this migration could be tried against first. Applying it is a production-database change, and per this session's established practice, that requires the same explicit, deliberate confirmation as every other migration applied so far (`0012`–`0014` were each presented and approved individually before being run).

**What this means concretely:**
- Code-level correctness of the whole pipeline is verified by the 142 passing unit/integration tests, which mock the database and the AI provider and cover exactly this flow (happy path, provider failure, malformed AI JSON, usage-limit exceeded — see `test/scan-analyze-route.test.ts`).
- A *live* run through the real Preview URL, hitting the real (shared) Supabase project and the real Anthropic API, cannot succeed yet — not because of a bug, but because the schema it needs isn't there.

## 5. What's needed before this can be marked verified and production deployment considered

1. **Explicit decision on migration `0015`.** It is purely additive (no drops, no data loss — see `docs/DIAGNOSTIC_MIGRATION_PLAN.md`) but still needs to be applied to the shared database deliberately, the same way `0012`–`0014` were.
2. Once applied, a real (or carefully mocked-as-real-as-possible) run through the Preview URL of: upload a synthetic scan report → extract → review → analyze → view the report (confirming categorical badges render, no `%` appears, the "Fault code categories" section shows `not_stated` correctly) → submit feedback.
3. Mobile-viewport check of the report page (resize the browser pane, confirm no horizontal overflow on the new category-badge grid).
4. Confirm the usage counter increments exactly once even if `/analyze` is retried after a failure (already covered by unit tests; a live confirmation would corroborate it against the real ledger).

## 6. Production deployment status

**Not deployed. Not authorized.** Per Phase 9's explicit instruction ("do not deploy until preview verification passes") and the STOP condition regarding an undistinguishable production database, this is intentionally left for you to review and decide on before I proceed further — see the final report in-conversation for the specific next-step choices.
