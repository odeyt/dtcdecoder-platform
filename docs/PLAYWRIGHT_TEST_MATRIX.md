# Playwright Test Matrix

| Suite | File(s) | Target | Auth | Real provider | Runs in normal CI |
|---|---|---|---|---|---|
| Landing smoke | `smoke/landing.spec.ts` | local/prod | none | no | yes |
| DTC lookup smoke | `smoke/dtc-lookup.spec.ts` | local/prod | none | no | yes |
| Pricing smoke | `smoke/pricing.spec.ts` | local/prod | none | no | yes |
| Login smoke | `smoke/login.spec.ts` | local/prod | none | no | yes |
| Diagnostic Engine anon auth | `security/diagnostic-engine-auth.spec.ts` | local | none | no | yes |
| Ordinary-user auth | `auth/ordinary-user.spec.ts` | local | throwaway synthetic | no | yes (needs Supabase admin secrets) |
| Mocked provider states (11) | `diagnostic-engine/mocked-provider-states.spec.ts` | local only | none | no (mocked) | yes |
| HV safety UI contract | `diagnostic-engine/hv-safety-contract.spec.ts` | local only | none | no (mocked) | yes |
| Kill-switch/budget UI contract | `diagnostic-engine/kill-switch-and-budget.spec.ts` | local only | none | no (mocked) | yes |
| Landing Guided Diagnosis CTA (anon) | `diagnostic-engine/landing-guided-diagnosis-cta.spec.ts` | local/prod | none | no | yes |
| Landing Guided Diagnosis CTA (eligible) | same file | prod-internal | owner | no (UI open only) | no — gated |
| Mobile/tablet responsive | `mobile/responsive.spec.ts` | local | none | no (partly mocked) | yes |
| Accessibility (axe + keyboard) | `accessibility/core-a11y.spec.ts` | local/prod | none | no | yes |
| Internal-owner Guided Diagnosis | `internal-owner/guided-diagnosis.spec.ts` | prod-internal | owner | yes (bounded, 1 case, ≤3 attempts) | no — gated |
| Provider reliability harness | `provider-reliability/reliability-harness.spec.ts` | prod-internal | owner | yes (bounded, 8 cases, ≤16 calls) | no — gated |

## Skipped tests and why

- `auth/ordinary-user.spec.ts` skips entirely when `SUPABASE_SERVICE_ROLE_KEY`
  / `NEXT_PUBLIC_SUPABASE_URL` aren't set (needed to create/delete the
  throwaway synthetic account).
- `internal-owner/*` and `provider-reliability/*` skip unless
  `RUN_PRODUCTION_INTERNAL_E2E=true` **and** a bootstrapped storage-state
  file exists at `tests/e2e/.auth/internal-owner.json` (run
  `tests/e2e/setup/auth.setup.ts` first — see `docs/PLAYWRIGHT_AUTH_SETUP.md`).
- The "eligible" half of the landing-CTA test (`landing-guided-diagnosis-cta.spec.ts`)
  is gated the same way as `internal-owner/*`.

## Golden diagnostic cases (Phase 22)

12 cases in `tests/e2e/fixtures/diagnostic-cases.ts` — see
`GoldenDiagnosticCase` type there. 5 immediate-stop HV hazard cases, 2
explicitly non-hazardous EV cases (historical/inactive evidence), 5
general gasoline-vehicle cases. Every case asserts a **stable contract**
(safety floor, required structured sections, next-question presence,
categorical confidence) — never exact hypothesis wording from a live
model.
