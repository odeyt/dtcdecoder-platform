// Shared driver for opening the real Guided Diagnosis flow in tests.
// DtcTechnicianShell's own toggle button and GuidedDiagnosisPanel's idle
// button are BOTH labeled "Start Guided Diagnosis" (both read the same
// dtcTechnicianShell.guidedDiagnosis translation key) — the toggle has
// aria-pressed, the panel's button doesn't, so `.and(locator)` disambiguates
// them. Found by actually running these tests, not by reading the source:
// clicking the toggle alone only switches DtcTechnicianShell into guided
// mode; it does not itself call runTurn().
import type { Page, Locator } from "@playwright/test";

export async function openGuidedDiagnosisPanel(page: Page): Promise<{ dialog: Locator }> {
  await page.getByRole("button", { name: "Open DTC Technician consultation" }).click();
  const dialog = page.getByRole("dialog");

  const toggle = dialog.getByRole("button", { name: "Start Guided Diagnosis", exact: true }).and(page.locator("[aria-pressed]"));
  await toggle.click();

  const panelStartButton = dialog
    .getByRole("button", { name: "Start Guided Diagnosis", exact: true })
    .and(page.locator(":not([aria-pressed])"));
  await panelStartButton.click();

  return { dialog };
}
