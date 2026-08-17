// Single source of truth for whether real-provider / internal-owner tests
// are allowed to run (Phase 4/9/11). Every spec file that touches a real
// OpenAI call or a real owner session must call requireProductionInternal()
// at the top of its describe block and skip (not fail) when it returns false —
// missing production secrets must never fail ordinary CI.
import { test } from "@playwright/test";

export function isProductionInternalEnabled(): boolean {
  return process.env.RUN_PRODUCTION_INTERNAL_E2E === "true";
}

// Call once per test file, before any test() calls in that file, e.g.:
//   test.describe("internal owner", () => {
//     requireProductionInternal();
//     test("...", async ({ page }) => { ... });
//   });
export function requireProductionInternal(): void {
  test.skip(!isProductionInternalEnabled(), "RUN_PRODUCTION_INTERNAL_E2E is not set to 'true' — skipping production-internal test.");
  test.skip(!process.env.E2E_INTERNAL_USER_EMAIL, "E2E_INTERNAL_USER_EMAIL is not configured — skipping.");
}

// Hard guard against a mocked-provider test accidentally running with
// PLAYWRIGHT_TARGET pointed at production — mocking a real production
// response would be actively misleading (Phase 10).
export function assertMockingAllowed(): void {
  const target = process.env.PLAYWRIGHT_TARGET ?? "local";
  if (target !== "local") {
    throw new Error(
      `Refusing to activate provider mocks under PLAYWRIGHT_TARGET=${target}. Provider mocking is only permitted for target=local.`,
    );
  }
}

const MAX_PROVIDER_CALLS_PER_RUN = 16;
let providerCallCount = 0;

// Called by the reliability harness before each real OpenAI call
// (Phase 11) — throws once the bounded cap is reached rather than letting a
// runaway loop keep spending.
export function reserveProviderCall(): void {
  providerCallCount += 1;
  if (providerCallCount > MAX_PROVIDER_CALLS_PER_RUN) {
    throw new Error(`Provider call cap (${MAX_PROVIDER_CALLS_PER_RUN}) exceeded for this test run — refusing further real calls.`);
  }
}

export function providerCallsUsed(): number {
  return providerCallCount;
}
