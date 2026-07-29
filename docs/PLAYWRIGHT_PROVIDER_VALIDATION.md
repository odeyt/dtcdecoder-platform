# Real-Provider Validation Procedure

## This is not a normal test run

`tests/e2e/internal-owner/` and `tests/e2e/provider-reliability/` make
real Anthropic API calls against real production budgets, using a real
owner session. Never run these automatically, never on a PR, never on a
schedule without explicit intent.

## Prerequisites

1. Confirm current production state: `DIAGNOSTIC_ENGINE_ROLLOUT_TIER=internal_only`,
   kill switch `false`, budgets configured (see this session's
   owner-activation work).
2. Bootstrap owner auth — `docs/PLAYWRIGHT_AUTH_SETUP.md`.
3. Confirm `E2E_INTERNAL_USER_EMAIL` is the intended owner/internal
   account and nothing else.

## Running

```bash
RUN_PRODUCTION_INTERNAL_E2E=true npm run test:e2e:internal:prod
# or, on Windows PowerShell:
$env:RUN_PRODUCTION_INTERNAL_E2E="true"; npm run test:e2e:internal:prod

RUN_PRODUCTION_INTERNAL_E2E=true npm run test:e2e:provider
```

## Bounds (hard-enforced)

- `tests/e2e/helpers/provider-gate.ts`'s `reserveProviderCall()` throws
  once 16 real calls have been made in a single test run.
- The reliability harness runs exactly 8 golden cases, max 2 attempts
  each (16-call cap matches exactly).
- The internal-owner contract suite runs exactly 1 case, max 3 attempts.

## What gets measured, not concealed

The reliability harness writes `test-results/provider-reliability.json`
with: `first_attempt_success_rate`, `post_retry_success_rate`,
`validation_failure_rate`, `timeout_rate`,
`safety_classification_pass_rate`, `average_latency_ms`, and a per-case
breakdown. **A retry succeeding is never treated as proof a deterministic
test passed** — the deterministic HV safety-floor assertions in
`hv-safety-contract.spec.ts` and the Vitest suite are the source of truth
for correctness; this harness only measures how often the *real* provider
call succeeds on the first or second try.

### Suggested acceptance gate (owner review, not auto-enforced)

- ≥ 20 controlled turns observed cumulatively across runs
- Zero unsafe results, zero unauthorized access
- 100% deterministic HV safety-floor compliance
- ≥ 90% valid structured output after the permitted retry
- No duplicate provider charges, no missing usage records, no secret
  leakage

Meeting this gate is **not** by itself permission to widen rollout beyond
`internal_only` — that remains a separate, explicit owner decision.

## After running

1. Review `test-results/provider-reliability.json`.
2. Run `tests/e2e/setup/cleanup.setup.ts` to delete synthetic records
   created by the run (the CI workflow does this automatically in an
   `if: always()` step).
3. Confirm no production env vars were left in a non-default state (kill
   switch `false`, rollout tier unchanged) — this suite never mutates
   them, but confirm anyway after any manual production testing session.

## Known provider behavior (not a bug)

`AI_RESPONSE_VALIDATION_FAILED` is a legitimate, documented, retryable
failure mode on `claude-sonnet-5` for this schema — observed repeatedly
during real production testing this session (including 4 consecutive
failures on one occasion). Investigated at length with no code defect
found; the tool/schema pairing is shared with the older, working Scan
Report Analysis feature. This is exactly what the reliability harness
exists to measure over time, not something a single bad run should be
read as a regression.
