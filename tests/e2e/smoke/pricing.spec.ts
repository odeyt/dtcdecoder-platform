import { test, expect } from "@playwright/test";
import { attachConsoleMonitor } from "../helpers/console-monitor";

test.describe("Pricing page smoke", () => {
  test("loads and renders plan cards with no console errors", async ({ page }) => {
    const console_ = attachConsoleMonitor(page);
    const response = await page.goto("/pricing");
    expect(response?.status()).toBeLessThan(400);

    // Plan labels are treated as a stable contract (not exact prices, per
    // Phase 7's explicit instruction not to assert exact prices unless
    // pricing is intentionally pinned).
    await expect(page.getByText("Free", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/pro technician/i).first()).toBeVisible();
    await expect(page.getByText(/workshop/i).first()).toBeVisible();

    console_.assertClean();
  });
});
