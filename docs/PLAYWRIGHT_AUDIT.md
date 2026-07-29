# Playwright Audit (Phase 1)

## Existing files

- `@playwright/test`: **not installed** — the only match anywhere in the repo is a transitive mention inside `package-lock.json` (a sub-dependency of some other package's own dev tooling, not a real Playwright install). No `playwright.config.*`, no `tests/e2e/`, no `.github/workflows/` directory at all.
- Vitest: fully established. `vitest.config.ts` at repo root, `test/` directory with 77 spec files covering scan-diagnostics, diagnostic-engine, entitlements, pricing, localization, and the orchestrator. `test/mocks/fake-supabase.ts` is the existing in-memory Supabase mock used by unit/integration tests (does not exercise real Postgres RLS).
- `package.json` scripts today: `dev`, `build`, `start`, `lint`, `test` (→ `vitest run`). No `test:e2e*` scripts exist yet.
- No CI workflow of any kind exists in this repo (`.github/workflows/` doesn't exist). Deployment is Vercel auto-deploy on push to `main`, no gating checks today beyond whatever the developer runs locally.

## Current package version

Not applicable — not installed.

## Current scripts

None (`test` only runs Vitest).

## Current coverage

- Unit/integration: extensive (Vitest), including a route-level security suite (`test/diagnostic-engine-security.test.ts`) that exercises the real Next.js route handlers via a `FakeSupabase` mock — but that mock cannot exercise real Postgres RLS or a real browser.
- Browser/E2E: **none**. All prior "browser QA" work in this project (referenced in `docs/PHASE_2_PRODUCTION_BROWSER_QA.md` and this session's manual owner-activation testing) was done manually via the Claude Code Browser pane tool, not as a repeatable automated suite.

## Missing coverage

- No automated cross-browser testing (Chromium/Firefox/WebKit).
- No automated mobile/tablet viewport testing.
- No automated accessibility assertions.
- No automated production smoke suite.
- No automated Diagnostic Engine access-boundary regression tests (anonymous/ordinary/internal) — these were all verified manually this session and would silently regress without a repeat of that manual process.
- No mocked-provider deterministic test harness for the 10 required provider-response states (success, retry-then-success, repeated failure, timeout, unavailable, budget block, kill-switch, malformed output, empty tool-use, HV/non-HV safety responses).
- No automated HV safety-floor regression tests at the UI/API-contract level (Vitest covers `safety.ts` unit logic already, but not the full request→response contract through a real browser).

## Authentication constraints

- This app supports **magic-link and password** sign-in (`src/app/(app)/account/login/page.tsx`, `LoginForms.tsx`/`PasswordLoginForm.tsx`/`MagicLinkForm.tsx`). Magic-link is unusable for automated production testing in this environment: Outlook Safe Links pre-scans and consumes the one-time token before a human/automation can click it (confirmed empirically this session). **Password auth is the only viable automated path** for any account that needs a repeatable, non-interactive sign-in.
- `ADMIN_ALLOWED_EMAILS` (Vercel "Sensitive"/write-only in Production) backs `internal_only` rollout-tier access — this must never be read, printed, or replaced by test tooling. An internal/owner E2E account must be an email the owner has already added there themselves.
- Ownership/ownership-based 404s and the rollout-tier check happen server-side (`src/app/api/diagnostic-engine/v1/cases/[caseId]/turn/route.ts`, `src/lib/diagnostic-engine/feature-flags.ts`) — this is the correct assertion surface for authorization tests, not UI visibility.

## Provider-cost risks

- Every real call to `runDiagnosticEngineTurn` against `AnthropicDiagnosticProvider` costs real money and consumes real per-user/global/internal budget dimensions (`src/lib/diagnostic-engine/budget-guard.ts`). Confirmed this session: `claude-sonnet-5` + forced tool-choice + `DiagnosticAiOutputSchema` occasionally (this session: 4/4) returns `AI_RESPONSE_VALIDATION_FAILED` — a legitimate, documented, retryable failure mode, not a bug found in this audit.
- Real-provider Playwright tests **must never run in ordinary CI** — they must be explicitly gated behind an opt-in env var and a bounded call cap, matching the pattern already established for this project's manual production HV validation (synthetic-only accounts, recorded baseline, explicit revert/cleanup).

## Recommended implementation plan

1. Install `@playwright/test` fresh (no existing config to reconcile with).
2. `playwright.config.ts` with 3 target modes (`local` / `production-smoke` / `production-internal`) driven by env vars, Chromium/Firefox/WebKit + one mobile-Android + one mobile-iOS + one tablet project.
3. Fixtures/helpers layer first (console monitor, network monitor, synthetic-data, provider-gate, cleanup) since every subsequent test group depends on them.
4. Deterministic, mocked-provider tests first (no real cost, safe for every PR) — public smoke, auth/security boundary tests, mocked Diagnostic Engine states, HV safety-floor tests, mobile/accessibility.
5. Real-provider reliability harness and internal-owner suite last, explicitly gated behind `RUN_PRODUCTION_INTERNAL_E2E=true` and skipped by default — not run as part of this implementation session (no owner credentials available to this session; per Phase 9/11 requirements these must skip safely, not fail, when absent).
6. One small, additive migration to close the real observability gap found in this audit: `tool_use_present` on `diagnostic_engine_runs`.
7. GitHub Actions workflow: PR/push run deterministic + mocked suites only; `workflow_dispatch` for real-provider/internal suites.
