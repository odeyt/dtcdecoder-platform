// Updated for the "Diagnostic Intake Console" landing hero (ServiceBayHero),
// which replaced the old chat-style LandingDtcTechnician hero. The old
// assertions here targeted DOM/labels that no longer exist ("Quick Code
// Lookup" and "DTC Technician™" links used to be hero-only; both labels now
// also appear in the sticky SiteNav, so a bare name match would hit two
// elements — assertions below are scoped to avoid that ambiguity. "Consult
// DTC Technician™" and a "Decode" button were the old hero's own controls
// and have no equivalent — the new hero is the intake console itself, not a
// dialog trigger.
import { test, expect } from "@playwright/test";
import { attachConsoleMonitor } from "../helpers/console-monitor";
import { attachNetworkMonitor } from "../helpers/network-monitor";

test.describe("Landing page smoke", () => {
  test("loads, renders the Diagnostic Intake Console and CTAs, no console/5xx errors", async ({ page }) => {
    const console_ = attachConsoleMonitor(page);
    const network = attachNetworkMonitor(page);

    const response = await page.goto("/");
    expect(response?.status()).toBeLessThan(400);

    await expect(page.getByRole("link", { name: "Start Diagnosis" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Decode a Code" })).toBeVisible();

    // The four Diagnostic Intake Console welcome cards (ServiceBayHero).
    await expect(page.getByRole("button", { name: "I have a diagnostic code" })).toBeVisible();
    await expect(page.getByRole("button", { name: "My vehicle has a symptom" })).toBeVisible();
    await expect(page.getByRole("button", { name: "I have a scan report" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue a previous diagnosis" })).toBeVisible();

    // No horizontal overflow — see Phase 15's "no horizontal page overflow" requirement.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow).toBe(false);

    network.assertNoServerErrors();
    console_.assertClean();
  });

  test("Diagnostic Intake Console does not fire a paid provider call on page load", async ({ page }) => {
    const network = attachNetworkMonitor(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(network.diagnosticEngineTurnCalls).toHaveLength(0);
  });
});
