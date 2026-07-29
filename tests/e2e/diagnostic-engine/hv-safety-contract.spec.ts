// HV safety-floor UI contract (Phase 13). The deterministic floor itself
// (provider text can raise but never lower classifyDriveSafety's
// evidence-only floor) is enforced server-side and already covered by
// Vitest (test/diagnostic-engine-safety.test.ts,
// test/diagnostic-engine-orchestrator.test.ts's "Core regression: safety
// is never null" suite) — those unit tests are the deterministic source of
// truth referenced here, not re-implemented. This file's job is narrower:
// confirm the UI never downgrades or hides whatever safety status the API
// actually returned, for every golden HV/non-HV case in the fixture set.
import { type Page } from "@playwright/test";
import { test, expect } from "../fixtures/authenticated-test";
import { assertMockingAllowed } from "../helpers/provider-gate";
import { openGuidedDiagnosisPanel } from "../helpers/guided-diagnosis";
import { GOLDEN_CASES, HV_HAZARD_CASE_IDS, NON_HAZARD_EV_CASE_IDS, goldenCase } from "../fixtures/diagnostic-cases";

async function openGuidedDiagnosisWithMockedTurn(page: Page, turnBody: Record<string, unknown>) {
  await page.route("**/api/scan-diagnostics/cases", (route) => route.fulfill({ status: 201, json: { case: { id: "mock-case-id" } } }));
  await page.route("**/api/diagnostic-engine/v1/cases/**/turn", (route) => route.fulfill({ status: 200, json: turnBody }));
  await page.goto("/dtc");
  const { dialog } = await openGuidedDiagnosisPanel(page);
  return dialog;
}

test.beforeEach(() => {
  assertMockingAllowed();
});

test.describe("HV safety-floor UI contract", () => {
  for (const id of HV_HAZARD_CASE_IDS) {
    test(`${id} — immediate_stop is prominent, no energized-pack guidance appears`, async ({ authenticatedPage: page }) => {
      const golden = goldenCase(id);
      const body = {
        response: {
          summary: "Mocked summary.",
          evidenceUsed: [],
          probabilityRanking: [],
          confidence: { overallConfidenceLevel: "insufficient_evidence", evidenceMissing: [] },
          recommendedTests: [],
          nextQuestion: null,
        },
        safety: {
          status: "immediate_stop",
          reasoning: golden.title,
          hvHazard: {
            hazardCategory: "hazard",
            immediateAction: "Stop driving and do not charge.",
            prohibitedActions: ["Do not open the battery pack", "Do not work on energized components"],
            requiredQualification: "HV-qualified technician only",
            ppeWarning: "Insulated PPE required.",
            manufacturerProcedureWarning: "Follow manufacturer lockout/tagout procedure.",
          },
        },
      };
      const dialog = await openGuidedDiagnosisWithMockedTurn(page, body);
      const alert = dialog.getByRole("alert");
      await expect(alert).toBeVisible();
      await expect(dialog.getByText("immediate_stop")).toBeVisible();

      const fullText = (await dialog.textContent()) ?? "";
      for (const prohibited of golden.expected.prohibitedGuidance ?? []) {
        // The mocked safety copy itself only ever tells the technician what
        // NOT to do — this asserts the panel never independently invents
        // instructions that overlap the prohibited-guidance list as
        // affirmative steps.
        expect(fullText.toLowerCase()).not.toContain(`you should ${prohibited.toLowerCase()}`);
      }
    });
  }

  for (const id of NON_HAZARD_EV_CASE_IDS) {
    test(`${id} — historical/inactive evidence does not force immediate_stop`, async ({ authenticatedPage: page }) => {
      const golden = goldenCase(id);
      const body = {
        response: {
          summary: "Mocked summary.",
          evidenceUsed: [],
          probabilityRanking: [],
          confidence: { overallConfidenceLevel: "medium", evidenceMissing: [] },
          recommendedTests: [],
          nextQuestion: null,
        },
        safety: { status: golden.expected.minimumSafety, reasoning: golden.title, hvHazard: null },
      };
      const dialog = await openGuidedDiagnosisWithMockedTurn(page, body);
      await expect(dialog.getByRole("alert")).toHaveCount(0);
      await expect(dialog.getByText("immediate_stop")).toHaveCount(0);
    });
  }

  test("golden case fixture set covers at least 12 cases with a defined safety floor", () => {
    expect(GOLDEN_CASES.length).toBeGreaterThanOrEqual(12);
    for (const c of GOLDEN_CASES) {
      expect(c.expected.minimumSafety).toEqual(expect.any(String));
    }
  });
});
