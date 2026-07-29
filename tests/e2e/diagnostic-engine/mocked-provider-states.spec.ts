// Mocked Diagnostic Engine provider states (Phase 10). Mocks at the
// network boundary the browser actually calls
// (/api/diagnostic-engine/v1/cases/[caseId]/turn) via page.route() — the
// real UI component (GuidedDiagnosisPanel) is exercised unmodified against
// canned responses, never the browser/DOM itself. Every test here calls
// assertMockingAllowed() first as a hard guard against accidentally
// running mocks with PLAYWRIGHT_TARGET pointed at production.
//
// Uses `authenticatedPage` (tests/e2e/fixtures/authenticated-test.ts) —
// DtcTechnicianShell gates GuidedDiagnosisPanel behind a real client-side
// auth check before any of these mocked API responses are ever reached,
// so a genuinely signed-in (synthetic, throwaway) session is required
// even though /turn and /cases are mocked.
import { type Page } from "@playwright/test";
import { test, expect } from "../fixtures/authenticated-test";
import { assertMockingAllowed } from "../helpers/provider-gate";
import { openGuidedDiagnosisPanel } from "../helpers/guided-diagnosis";

async function openGuidedDiagnosis(page: Page) {
  // GuidedDiagnosisPanel calls POST /api/scan-diagnostics/cases first
  // (ensureCaseId) before it ever calls /turn — mock it too.
  await page.route("**/api/scan-diagnostics/cases", (route) =>
    route.fulfill({ status: 201, json: { case: { id: "mock-case-id" } } }),
  );
  // /dtc, not "/", avoids the landing page's separate (and currently
  // disabled — see Phase 17) "Start Guided Diagnosis" placeholder, which
  // shares the same accessible name as the real toggle tested here.
  await page.goto("/dtc");
  const { dialog } = await openGuidedDiagnosisPanel(page);
  return dialog;
}

function successBody(overrides: Record<string, unknown> = {}) {
  return {
    caseId: "mock-case-id",
    response: {
      summary: "Mocked structured diagnostic summary.",
      evidenceUsed: [{ id: "ev-1", summary: "Mocked evidence item" }],
      probabilityRanking: [{ rank: 1, hypothesis: "Mocked hypothesis", confidenceLevel: "medium", reasoning: "Mocked reasoning" }],
      confidence: { overallConfidenceLevel: "medium", evidenceMissing: [] },
      recommendedTests: ["Mocked recommended test"],
      nextQuestion: null,
    },
    safety: { status: "safe_to_drive", reasoning: "No safety-relevant evidence.", hvHazard: null },
    ...overrides,
  };
}

const HV_HAZARD_BODY = successBody({
  safety: {
    status: "immediate_stop",
    reasoning: "Active HV isolation fault.",
    hvHazard: {
      hazardCategory: "isolation_fault",
      immediateAction: "Stop driving immediately.",
      prohibitedActions: ["Do not drive the vehicle", "Do not open the battery pack"],
      requiredQualification: "HV-qualified technician only",
      ppeWarning: "Use insulated PPE rated for this voltage class.",
      manufacturerProcedureWarning: "Follow the manufacturer's lockout/tagout procedure.",
    },
  },
});

test.beforeEach(() => {
  assertMockingAllowed();
});

test.describe("Mocked Diagnostic Engine provider states", () => {
  test("successful structured response renders summary, evidence, confidence, safety", async ({ authenticatedPage }) => {
    await authenticatedPage.route("**/api/diagnostic-engine/v1/cases/**/turn", (route) =>
      route.fulfill({ status: 200, json: successBody() }),
    );
    const dialog = await openGuidedDiagnosis(authenticatedPage);
    await expect(dialog.getByText("Mocked structured diagnostic summary.")).toBeVisible();
    await expect(dialog.getByText("safe_to_drive")).toBeVisible();
  });

  test("retryable validation failure then success — recovers after manual retry", async ({ authenticatedPage }) => {
    let attempt = 0;
    await authenticatedPage.route("**/api/diagnostic-engine/v1/cases/**/turn", (route) => {
      attempt += 1;
      if (attempt === 1) {
        return route.fulfill({
          status: 502,
          json: { error: "The diagnostic response could not be validated.", code: "AI_RESPONSE_VALIDATION_FAILED", retryable: true },
        });
      }
      return route.fulfill({ status: 200, json: successBody() });
    });
    const dialog = await openGuidedDiagnosis(authenticatedPage);
    await dialog.getByRole("button", { name: /try again/i }).click();
    await expect(dialog.getByText("Mocked structured diagnostic summary.")).toBeVisible();
  });

  test("repeated validation failure — shows retry option, never a fabricated diagnosis", async ({ authenticatedPage }) => {
    await authenticatedPage.route("**/api/diagnostic-engine/v1/cases/**/turn", (route) =>
      route.fulfill({
        status: 502,
        json: { error: "The diagnostic response could not be validated.", code: "AI_RESPONSE_VALIDATION_FAILED", retryable: true },
      }),
    );
    const dialog = await openGuidedDiagnosis(authenticatedPage);
    await expect(dialog.getByRole("button", { name: /try again/i })).toBeVisible();
    await expect(dialog.getByText("Mocked structured diagnostic summary.")).not.toBeVisible();
  });

  for (const [label, response] of Object.entries({
    "provider timeout / unavailable": { status: 503, json: { error: "The diagnostic engine is temporarily unavailable. Please try again shortly.", retryable: true } },
    "budget block": { status: 503, json: { error: "The diagnostic engine is temporarily unavailable. Please try again shortly.", retryable: true } },
    "kill-switch block": { status: 503, json: { error: "The diagnostic engine is temporarily unavailable. Please try again shortly.", retryable: true } },
    "malformed provider output": { status: 502, json: { error: "The diagnostic response could not be validated.", code: "AI_RESPONSE_VALIDATION_FAILED", retryable: true } },
    "empty tool-use response": { status: 502, json: { error: "The diagnostic response could not be validated.", code: "AI_RESPONSE_VALIDATION_FAILED", retryable: true } },
  } as const)) {
    test(`${label} — generic error shown, no internal detail leaked`, async ({ authenticatedPage }) => {
      await authenticatedPage.route("**/api/diagnostic-engine/v1/cases/**/turn", (route) => route.fulfill(response));
      const dialog = await openGuidedDiagnosis(authenticatedPage);
      const dialogText = (await dialog.textContent()) ?? "";
      expect(dialogText).not.toMatch(/\$\d|budget|kill.switch|claude-|api[_-]?key/i);
      await expect(dialog.getByRole("button", { name: /try again/i })).toBeVisible();
    });
  }

  test("high-voltage immediate_stop response shows prominent hazard alert with prohibited actions", async ({ authenticatedPage }) => {
    await authenticatedPage.route("**/api/diagnostic-engine/v1/cases/**/turn", (route) => route.fulfill({ status: 200, json: HV_HAZARD_BODY }));
    const dialog = await openGuidedDiagnosis(authenticatedPage);
    const alert = dialog.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/do not drive|do not open the battery pack/i);
    await expect(dialog.getByText("immediate_stop")).toBeVisible();
  });

  test("non-hazardous EV response does not render a hazard alert", async ({ authenticatedPage }) => {
    await authenticatedPage.route("**/api/diagnostic-engine/v1/cases/**/turn", (route) =>
      route.fulfill({ status: 200, json: successBody({ safety: { status: "safe_to_drive", reasoning: "Historical code only, no active hazard.", hvHazard: null } }) }),
    );
    const dialog = await openGuidedDiagnosis(authenticatedPage);
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await expect(dialog.getByText("safe_to_drive")).toBeVisible();
  });

  // Tests the panel's handling of a 401 FROM THE /turn RESPONSE (e.g. a
  // session that expired mid-flight) — not an anonymous visitor, since
  // reaching this UI at all requires the real signed-in session
  // `authenticatedPage` provides.
  test("401 from /turn renders a sign-in prompt, not a crash", async ({ authenticatedPage }) => {
    await authenticatedPage.route("**/api/diagnostic-engine/v1/cases/**/turn", (route) =>
      route.fulfill({ status: 401, json: { error: "Sign in to use the diagnostic engine." } }),
    );
    const dialog = await openGuidedDiagnosis(authenticatedPage);
    await expect(dialog.getByText(/sign in/i)).toBeVisible();
  });

  test("locked (404 under internal_only) renders an upgrade/locked state, not the panel", async ({ authenticatedPage }) => {
    await authenticatedPage.route("**/api/diagnostic-engine/v1/cases/**/turn", (route) =>
      route.fulfill({ status: 404, json: { error: "The AI Diagnostic Engine is not available yet." } }),
    );
    const dialog = await openGuidedDiagnosis(authenticatedPage);
    await expect(dialog.getByText(/available yet/i)).toBeVisible();
  });

  test("limit reached (429) renders an upgrade CTA", async ({ authenticatedPage }) => {
    await authenticatedPage.route("**/api/diagnostic-engine/v1/cases/**/turn", (route) =>
      route.fulfill({ status: 429, json: { error: { message: "Daily limit reached." } } }),
    );
    const dialog = await openGuidedDiagnosis(authenticatedPage);
    await expect(dialog.getByRole("link", { name: /upgrade/i })).toBeVisible();
  });
});
