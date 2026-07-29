# Playwright Troubleshooting

## Viewing results

```bash
npm run test:e2e:report   # opens the last HTML report
```

Traces (`trace: "on-first-retry"`) and videos are only captured on retry
in CI, or on failure locally (`screenshot: "only-on-failure"`). Open a
trace with:

```bash
npx playwright show-trace test-results/<test-name>/trace.zip
```

## Common failures

| Symptom | Likely cause | Fix |
|---|---|---|
| `webServer` never becomes ready | `next dev` failed to start, or port 3000 already in use | Run `npm run dev` manually first to see the real error |
| Every `diagnostic-engine/*` mocked test fails at `ensureCaseId` | `/api/scan-diagnostics/cases` route mock missing | Mocked tests must mock **both** `/cases` and `/turn` — see `openGuidedDiagnosis()` helpers |
| `auth/ordinary-user.spec.ts` skips | `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_SUPABASE_URL` not set | Set them, or accept the skip locally |
| `internal-owner/*` / `provider-reliability/*` skip | `RUN_PRODUCTION_INTERNAL_E2E` not `"true"`, or no bootstrapped storage state | See `docs/PLAYWRIGHT_AUTH_SETUP.md` |
| `assertMockingAllowed()` throws | `PLAYWRIGHT_TARGET` is not `local` while a mocked test ran | Mocked tests only run against `local` — this is an intentional hard guard, not a bug |
| Magic-link sign-in "works" locally but never in CI | Don't use magic-link at all — see `docs/PLAYWRIGHT_AUTH_SETUP.md`'s Outlook Safe Links note | Use password auth |
| Flaky `getByRole("dialog")` visibility | The DTC Technician shell's open animation/focus-trap effect | Prefer `await expect(locator).toBeVisible()` (auto-retries) over a fixed `waitForTimeout` |

## Adding a new golden diagnostic case

Add an entry to `GOLDEN_CASES` in `tests/e2e/fixtures/diagnostic-cases.ts`
matching the `GoldenDiagnosticCase` shape. Only assert stable contracts in
`expected` (safety floor, required sections, question count) — never
exact model wording. If it's an HV hazard case, it's picked up
automatically by `HV_HAZARD_CASE_IDS` (filtered by
`expected.minimumSafety === "immediate_stop"`).

## Running only HV tests

```bash
npx playwright test tests/e2e/diagnostic-engine/hv-safety-contract.spec.ts
```

## Running only mobile tests

```bash
npm run test:e2e:mobile
```

## Disabling provider-backed tests entirely

They're already off by default — `internal-owner/` and
`provider-reliability/` both call `requireProductionInternal()`, which
skips unless `RUN_PRODUCTION_INTERNAL_E2E=true`. Simply don't set that
variable.

## `cross-env` / Windows

Scripts that set env vars inline (`test:e2e:smoke:prod`,
`test:e2e:internal:prod`) use `cross-env` because this repo is developed
on Windows, where `VAR=value command` isn't valid PowerShell/cmd syntax.
If you add a new script with an inline env var, wrap it in `cross-env`
too.
