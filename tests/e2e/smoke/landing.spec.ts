import { test, expect } from "@playwright/test";
import { attachConsoleMonitor } from "../helpers/console-monitor";
import { attachNetworkMonitor } from "../helpers/network-monitor";

test.describe("Landing page smoke", () => {
  test("loads, renders navigation and CTAs, no console/5xx errors", async ({ page }) => {
    const console_ = attachConsoleMonitor(page);
    const network = attachNetworkMonitor(page);

    const response = await page.goto("/");
    expect(response?.status()).toBeLessThan(400);

    await expect(page.getByRole("link", { name: "Quick Code Lookup" })).toBeVisible();
    await expect(page.getByRole("link", { name: "DTC Technician™" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Consult DTC Technician™" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Decode" })).toBeVisible();

    // No horizontal overflow — see Phase 15's "no horizontal page overflow" requirement.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow).toBe(false);

    network.assertNoServerErrors();
    console_.assertClean();
  });

  test("Guided Diagnosis entry point does not fire a provider call on page load", async ({ page }) => {
    const network = attachNetworkMonitor(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(network.diagnosticEngineTurnCalls).toHaveLength(0);
  });
});
