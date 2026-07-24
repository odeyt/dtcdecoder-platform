# Production Verification — Diagnostic Safety v2

Status as of this writing: **deployed to production.** `feature/diagnostic-safety-v2` was merged into `main` and pushed, triggering an automatic Production build that completed successfully and is now live on `dtcdecoder.com`.

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

## 5. Production deployment

| Field | Value |
|---|---|
| Merge | `feature/diagnostic-safety-v2` → `main`, fast-forward, no conflicts |
| Commit | `46c41fe` (`main` and the feature branch tip are identical) |
| Trigger | Push to `origin/main` auto-triggered a Production build via Vercel's GitHub integration |
| Build | ✅ Ready — `https://dtcdecoder-2ea66gv4v-redlined1-s-projects.vercel.app` |
| Domain aliasing | Confirmed: `dtcdecoder.com`, `www.dtcdecoder.com`, `dtcdecoder.vercel.app` all point at this new deployment |
| Smoke test | Homepage loads correctly, no console errors. `/diagnostics` correctly redirects an unauthenticated visitor to sign-in (not a 500, not an open page) |

## 6. Remaining item: a real, signed-in, end-to-end run

Everything above confirms the deployment is healthy and nothing crashed. What hasn't been done yet — and requires a **signed-in real account**, which this automated pass doesn't have — is an actual upload → extract → review → analyze → report cycle confirming: categorical badges render (no `%` anywhere), the "Fault code categories" section shows the right found/not_stated states for a real report, mobile layout holds up, and the usage counter behaves correctly on a retry. This is the one item left for you (or a follow-up session with real credentials) to confirm directly against production.
