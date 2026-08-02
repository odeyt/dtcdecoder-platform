import { test, expect } from "@playwright/test";
import { attachConsoleMonitor } from "../helpers/console-monitor";
import { attachNetworkMonitor } from "../helpers/network-monitor";

// P0420 is a stable, well-known DTC used as the fixed smoke-test code
// throughout this project's own manual QA history (docs/PHASE_2_PRODUCTION_BROWSER_QA.md).
test.describe("DTC lookup smoke — P0420", () => {
  test("resolves to the code's detail page with no provider call", async ({ page }) => {
    const console_ = attachConsoleMonitor(page);
    const network = attachNetworkMonitor(page);

    const response = await page.goto("/dtc/P0420");
    expect(response?.status()).toBeLessThan(400);

    await expect(page.getByText("P0420", { exact: false }).first()).toBeVisible();
    // The description is deterministic reference data — the specific phrase
    // is a stable contract for this well-known code, not a live-model output.
    await expect(page.getByText(/catalyst/i).first()).toBeVisible();

    expect(network.diagnosticEngineTurnCalls).toHaveLength(0);
    network.assertNoServerErrors();
    console_.assertClean();
  });

  test("search form resolves P0420 end to end", async ({ page }) => {
    await page.goto("/dtc");
    // Placeholder copy is "Enter DTC code, symptom, or vehicle issue..." —
    // no "a" before "DTC code" (messages/en.json's dtcSearch.placeholder).
    await page.getByPlaceholder(/enter dtc code/i).fill("P0420");
    await page.getByRole("button", { name: "Decode" }).click();

    // The search page shows a results list at /dtc?q=... (it doesn't
    // auto-navigate to the code's own page even for a single exact match)
    // — the test drives the same click-through a real visitor would.
    await expect(page).toHaveURL(/\/dtc\?q=P0420/i);
    const resultLink = page.getByRole("link", { name: /P0420/i });
    await expect(resultLink).toBeVisible();
    await resultLink.click();
    await expect(page).toHaveURL(/\/dtc\/P0420/i);
  });
});
