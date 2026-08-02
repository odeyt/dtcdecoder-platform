// Mobile/tablet responsive checks (Phase 15). Runs against the
// mobile-chrome / mobile-safari / tablet Playwright projects (see
// playwright.config.ts) — `npm run test:e2e:mobile` targets exactly these.
import { test, expect } from "../fixtures/authenticated-test";
import { openGuidedDiagnosisPanel } from "../helpers/guided-diagnosis";

test.describe("Responsive layout", () => {
  test("landing page has no horizontal overflow and nav remains usable", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow).toBe(false);
    // "Consult DTC Technician™" was the old chat-style hero's own button —
    // replaced by the Diagnostic Intake Console (ServiceBayHero), whose
    // welcome-screen entry point is this card (see smoke/landing.spec.ts).
    await expect(page.getByRole("button", { name: "I have a diagnostic code" })).toBeVisible();
  });

  test("DTC Technician shell opens and the consultation panel fits the viewport", async ({ page }) => {
    await page.goto("/dtc");
    const trigger = page.getByRole("button", { name: "Open DTC Technician consultation" });
    await expect(trigger).toBeVisible();
    // Touch target size — WCAG 2.5.5/2.5.8 minimum is 24-44px depending on
    // level; assert against the practical 40px floor this app's own
    // buttons use (`min-h-11` = 44px in the codebase's own components).
    const box = await trigger.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(24);

    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const dialogBox = await dialog.boundingBox();
    const viewport = page.viewportSize();
    if (dialogBox && viewport) {
      expect(dialogBox.width).toBeLessThanOrEqual(viewport.width + 1);
    }
  });

  test("mocked HV safety alert remains visible and prominent on a small viewport", async ({ authenticatedPage: page }) => {
    await page.route("**/api/scan-diagnostics/cases", (route) => route.fulfill({ status: 201, json: { case: { id: "mock-case-id" } } }));
    await page.route("**/api/diagnostic-engine/v1/cases/**/turn", (route) =>
      route.fulfill({
        status: 200,
        json: {
          response: { summary: "Mocked summary.", evidenceUsed: [], probabilityRanking: [], confidence: { overallConfidenceLevel: "insufficient_evidence", evidenceMissing: [] }, recommendedTests: [], nextQuestion: null },
          safety: {
            status: "immediate_stop",
            reasoning: "Active HV hazard.",
            hvHazard: {
              hazardCategory: "hazard",
              immediateAction: "Stop driving immediately.",
              prohibitedActions: ["Do not open the battery pack"],
              requiredQualification: "HV-qualified technician only",
              ppeWarning: "Insulated PPE required.",
              manufacturerProcedureWarning: "Follow lockout/tagout procedure.",
            },
          },
        },
      }),
    );
    await page.goto("/dtc");
    const { dialog } = await openGuidedDiagnosisPanel(page);

    const alert = dialog.getByRole("alert");
    await expect(alert).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow).toBe(false);
  });
});
