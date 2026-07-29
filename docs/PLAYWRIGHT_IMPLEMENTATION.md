# Playwright E2E Implementation

## Installation

```bash
npm install --save-dev @playwright/test @axe-core/playwright cross-env
npx playwright install --with-deps chromium firefox webkit
```

Already done in this repo — this is for reference / a fresh clone.

## Directory layout

```
playwright.config.ts
tests/e2e/
  smoke/                   # Public production smoke — landing, DTC lookup, pricing, login
  security/                # Diagnostic Engine API authorization boundary (anonymous)
  auth/                    # Ordinary (non-admin) authenticated user
  internal-owner/          # Real owner session, deterministic contract only (gated)
  diagnostic-engine/       # Mocked provider states, HV safety UI contract, kill-switch/budget, landing CTA
  provider-reliability/    # Real-provider reliability harness (gated, bounded)
  mobile/                  # Responsive/viewport checks
  accessibility/           # axe-core scans + keyboard/focus checks
  fixtures/                # test-users.ts, diagnostic-cases.ts (golden cases)
  helpers/                 # console-monitor, network-monitor, synthetic-data, provider-gate, auth, api, database-cleanup
  setup/                   # auth.setup.ts (manual storage-state bootstrap), cleanup.setup.ts (teardown)
  .auth/                   # gitignored — storage state written by auth.setup.ts
```

## Local commands

```bash
npm run test:e2e              # everything, local target
npm run test:e2e:ui           # Playwright UI mode
npm run test:e2e:headed       # headed browser
npm run test:e2e:debug        # step debugger
npm run test:e2e:chromium     # chromium only, faster iteration
npm run test:e2e:mobile       # mobile-chrome + mobile-safari + tablet
npm run test:e2e:smoke        # tests/e2e/smoke only
npm run test:e2e:security     # tests/e2e/security only
npm run test:e2e:diagnostic   # tests/e2e/diagnostic-engine only
npm run test:e2e:a11y         # tests/e2e/accessibility only
npm run test:e2e:report       # open the last HTML report
```

## CI commands

```bash
npm run test:e2e:smoke:prod        # public smoke against https://dtcdecoder.com
npm run test:e2e:internal:prod     # internal-owner + provider-reliability, gated
```

See `.github/workflows/playwright.yml` — the `deterministic` job is the only
one that should ever be a required PR check. `production-smoke` and
`production-internal` are `workflow_dispatch`-only.

## Target model

`PLAYWRIGHT_TARGET` env var: `local` (default, starts `next dev` via
`webServer`), `production-smoke`, or `production-internal`. Real-provider
and internal-owner tests additionally require `RUN_PRODUCTION_INTERNAL_E2E=true`
— see `tests/e2e/helpers/provider-gate.ts`.

## What's NOT automated in this pass

- No Vercel deploy-hook trigger wired for `production-smoke` — the workflow
  supports it (`workflow_dispatch`), but nothing calls it automatically on
  deploy yet. Wire that separately when desired.
- `internal-owner` and `provider-reliability` suites have never been run
  against real production in this implementation session — no owner
  credentials were available. They're written, gated, and skip safely; a
  human with real `E2E_INTERNAL_USER_EMAIL`/`PASSWORD` must run them once to
  confirm end-to-end (see `docs/PLAYWRIGHT_PROVIDER_VALIDATION.md`).
- Migration `0037_diagnostic_engine_runs_tool_use_present.sql` has been
  written and reviewed but not yet applied to production — same
  human-pastes-SQL process as every other migration in this project.
