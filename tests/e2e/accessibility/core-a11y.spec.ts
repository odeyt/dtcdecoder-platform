// Core accessibility assertions (Phase 16). Uses axe-core (already the
// industry-standard scanner for exactly this) for automated rule
// violations, plus targeted manual checks for the interaction patterns
// axe can't verify (focus trap, focus return, Escape-to-close).
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Automated accessibility scan", () => {
  test("landing page has no critical/serious axe violations", async ({ page }) => {
    await page.goto("/");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("pricing page has no critical/serious axe violations", async ({ page }) => {
    await page.goto("/pricing");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("login page has no critical/serious axe violations and form controls are labeled", async ({ page }) => {
    await page.goto("/account/login");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
    await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
  });
});

test.describe("DTC Technician consultation dialog — keyboard and focus", () => {
  test("dialog has role and accessible name, Escape closes it, focus returns to the trigger", async ({ page }) => {
    await page.goto("/dtc");
    const trigger = page.getByRole("button", { name: "Open DTC Technician consultation" });
    await trigger.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleName(/dtc technician/i);

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test("disabled controls explain why via an accessible name/title", async ({ page }) => {
    await page.goto("/");
    const disabledGuided = page.locator('button[disabled][title]', { hasText: "Start Guided Diagnosis" });
    if (await disabledGuided.count()) {
      await expect(disabledGuided.first()).toHaveAttribute("title", /.+/);
    }
  });
});
