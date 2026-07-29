// Kill-switch and budget UI/API-contract tests (Phase 14). Never mutates
// real Production environment variables — that's exactly what this suite
// is forbidden from doing. The actual server-side enforcement logic
// (isDiagnosticEngineKillSwitchActive, computeDiagnosticEngineBudgetState,
// assertDiagnosticEngineBudgetAllows, and every budget dimension including
// "internal is additive, not exempt") is deterministic and already covered
// by Vitest (test/diagnostic-engine-budget-guard.test.ts,
// test/diagnostic-engine-orchestrator.test.ts). This file mocks the
// resulting HTTP response shape and asserts what the browser does with it.
//
// Uses `authenticatedPage` — see mocked-provider-states.spec.ts's header
// comment for why a real (synthetic) session is required to reach this UI.
import { type Page } from "@playwright/test";
import { test, expect } from "../fixtures/authenticated-test";
import { assertMockingAllowed } from "../helpers/provider-gate";
import { openGuidedDiagnosisPanel } from "../helpers/guided-diagnosis";

const BLOCKED_RESPONSE = {
  status: 503,
  json: { error: "The diagnostic engine is temporarily unavailable. Please try again shortly.", retryable: true },
};

async function openGuidedDiagnosisBlocked(page: Page) {
  await page.route("**/api/scan-diagnostics/cases", (route) => route.fulfill({ status: 201, json: { case: { id: "mock-case-id" } } }));
  await page.route("**/api/diagnostic-engine/v1/cases/**/turn", (route) => route.fulfill(BLOCKED_RESPONSE));
  await page.goto("/dtc");
  const { dialog } = await openGuidedDiagnosisPanel(page);
  return dialog;
}

test.beforeEach(() => {
  assertMockingAllowed();
});

test.describe("Kill-switch / budget blocked responses", () => {
  test("kill-switch/budget block shows a generic unavailable message, never a dollar figure or internal scope name", async ({ authenticatedPage }) => {
    const dialog = await openGuidedDiagnosisBlocked(authenticatedPage);
    await expect(dialog.getByRole("button", { name: /try again/i })).toBeVisible();
    const text = (await dialog.textContent()) ?? "";
    expect(text).toMatch(/unavailable|try again/i);
    expect(text).not.toMatch(/\$\d/);
    expect(text).not.toMatch(/global_daily|global_monthly|user_daily|user_monthly|internal_daily/i);
  });

  test("a blocked call does not leave the panel in a false-success state", async ({ authenticatedPage }) => {
    const dialog = await openGuidedDiagnosisBlocked(authenticatedPage);
    await expect(dialog.getByText(/mocked structured/i)).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: /try again/i })).toBeVisible();
  });

  test("retrying a blocked call sends a new idempotency requestId each time (no duplicate-charge shape)", async ({ authenticatedPage: page }) => {
    const seenRequestIds: string[] = [];
    await page.route("**/api/scan-diagnostics/cases", (route) => route.fulfill({ status: 201, json: { case: { id: "mock-case-id" } } }));
    await page.route("**/api/diagnostic-engine/v1/cases/**/turn", async (route) => {
      const body = route.request().postDataJSON() as { requestId?: string };
      if (body.requestId) seenRequestIds.push(body.requestId);
      await route.fulfill(BLOCKED_RESPONSE);
    });
    await page.goto("/dtc");
    const { dialog } = await openGuidedDiagnosisPanel(page);
    await dialog.getByRole("button", { name: /try again/i }).click();
    await expect(dialog.getByRole("button", { name: /try again/i })).toBeVisible();

    expect(seenRequestIds.length).toBeGreaterThanOrEqual(2);
    expect(new Set(seenRequestIds).size).toBe(seenRequestIds.length);
  });
});
