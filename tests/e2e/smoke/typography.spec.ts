import { test, expect } from "@playwright/test";
import { attachConsoleMonitor } from "../helpers/console-monitor";

// Typography-modernization pass (docs/design/TYPOGRAPHY_SYSTEM.md) —
// covers every public page named in the brief. Authenticated surfaces
// (DTC Technician conversation, scan report, account credit display) are
// covered structurally by test/legal-pages-typography.test.tsx and
// test/typography-tokens.test.ts (prose class / testid presence) rather
// than here, since this repo's deterministic Playwright suite runs with
// no real auth session — see the account/dtc-technician/scan-report e2e
// specs elsewhere in this repo for the authenticated-flow smoke coverage
// pattern this would otherwise duplicate.
const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "mobile-390", width: 390, height: 844 },
];

const PAGES = [
  { name: "landing", path: "/", testid: null },
  { name: "pricing", path: "/pricing", testid: "pricing-page" },
  { name: "dtc-result", path: "/dtc/P0420", testid: null },
  { name: "faq", path: "/faq", testid: "faq-content" },
];

for (const viewport of VIEWPORTS) {
  test.describe(`Typography — ${viewport.name} (${viewport.width}x${viewport.height})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const page_ of PAGES) {
      test(`${page_.name}: no overflow, correct font, no console errors`, async ({ page }) => {
        const console_ = attachConsoleMonitor(page);
        const response = await page.goto(page_.path);
        expect(response?.status()).toBeLessThan(400);

        // No horizontal scroll at this viewport.
        const overflowX = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        );
        expect(overflowX).toBe(false);

        // Body resolves to the Geist sans stack, not a browser default.
        const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
        expect(bodyFont.toLowerCase()).toContain("geist");

        // Body line-height reads as the 1.65 baseline (allow for browser
        // rounding — computed as a px value at 16px base: ~26.4px).
        const bodyLineHeight = await page.evaluate(() => getComputedStyle(document.body).lineHeight);
        const lineHeightPx = parseFloat(bodyLineHeight);
        expect(lineHeightPx).toBeGreaterThan(24);
        expect(lineHeightPx).toBeLessThan(30);

        if (page_.testid) {
          await expect(page.getByTestId(page_.testid)).toBeVisible();
        }

        // No heading should render at 0 width/height (clipped/collapsed).
        const headingBoxes = await page.locator("h1, h2").evaluateAll((els) =>
          els.map((el) => {
            const r = el.getBoundingClientRect();
            return { width: r.width, height: r.height };
          }),
        );
        for (const box of headingBoxes) {
          expect(box.width).toBeGreaterThan(0);
          expect(box.height).toBeGreaterThan(0);
        }

        console_.assertClean();
      });
    }
  });
}

test.describe("Typography — screenshots", () => {
  for (const viewport of [
    { name: "desktop-1440", width: 1440, height: 900 },
    { name: "tablet-768", width: 768, height: 1024 },
    { name: "mobile-390", width: 390, height: 844 },
  ]) {
    test(`pricing page screenshot @ ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/pricing");
      await page.screenshot({
        path: `test-results/artifacts/typography-pricing-${viewport.name}.png`,
        fullPage: true,
      });
    });
  }

  test("DTC result page (long-form content) screenshot @ desktop-1440", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dtc/P0420");
    await page.screenshot({
      path: "test-results/artifacts/typography-dtc-result-desktop-1440.png",
      fullPage: true,
    });
  });

  test("FAQ page (prose-diagnostic content) screenshot @ mobile-390", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/faq");
    await page.screenshot({
      path: "test-results/artifacts/typography-faq-mobile-390.png",
      fullPage: true,
    });
  });
});
