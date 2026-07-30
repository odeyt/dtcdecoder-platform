import { test, expect } from "@playwright/test";
import { attachConsoleMonitor } from "../helpers/console-monitor";

// Layout/alignment coverage for the redesigned Professional Diagnostic
// Report one-time card (docs/billing/ONE_TIME_PROFESSIONAL_REPORT.md) —
// the brief's explicit viewport matrix. Runs as its own spec (not folded
// into pricing.spec.ts's existing smoke test) since it asserts exact
// bounding-box alignment against the subscription grid, which only makes
// sense at fixed pixel viewports rather than the project device presets.
const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "laptop-1024", width: 1024, height: 768 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-360", width: 360, height: 800 },
];

for (const viewport of VIEWPORTS) {
  test.describe(`One-time report card — ${viewport.name} (${viewport.width}x${viewport.height})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("renders aligned with the subscription grid, no overflow, no console errors", async ({ page }) => {
      const console_ = attachConsoleMonitor(page);
      const response = await page.goto("/pricing");
      expect(response?.status()).toBeLessThan(400);

      const grid = page.getByTestId("pricing-plans-grid");
      const card = page.getByTestId("one-time-report-card");
      await expect(grid).toBeVisible();
      await expect(card).toBeVisible();

      // Outer left/right edges must line up with the subscription grid —
      // the redesign's core requirement (no independent max-width wrapper
      // narrowing the card). A few sub-pixel/border pixels of tolerance.
      const gridBox = await grid.boundingBox();
      const cardBox = await card.boundingBox();
      expect(gridBox).not.toBeNull();
      expect(cardBox).not.toBeNull();
      expect(Math.abs(gridBox!.x - cardBox!.x)).toBeLessThanOrEqual(2);
      expect(Math.abs(gridBox!.x + gridBox!.width - (cardBox!.x + cardBox!.width))).toBeLessThanOrEqual(2);

      // No horizontal scroll anywhere on the page at this viewport.
      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(hasHorizontalOverflow).toBe(false);

      // Price hierarchy: crossed-out reference price, prominent current price.
      await expect(page.getByTestId("one-time-report-reference-price")).toHaveText("$9.99");
      await expect(page.getByTestId("one-time-report-price")).toHaveText("$6.99");

      // Feature list rendered.
      const features = page.getByTestId("one-time-report-features").locator("li");
      await expect(features).toHaveCount(8);

      // CTA present and, on mobile widths, full-width matching the
      // subscription cards' own CTA width (not a narrow floating button).
      const cta = page.getByTestId("one-time-report-cta");
      await expect(cta).toBeVisible();
      const ctaBox = await cta.boundingBox();
      expect(ctaBox).not.toBeNull();
      expect(ctaBox!.height).toBeGreaterThanOrEqual(44);

      if (viewport.width <= 390) {
        // Full-width CTA on mobile — its box should span close to the
        // card's own inner width (allowing for the card's padding).
        expect(ctaBox!.width).toBeGreaterThan(cardBox!.width * 0.7);
      }

      console_.assertClean();
    });

    test("CTA is keyboard-reachable and shows a visible focus state", async ({ page }) => {
      await page.goto("/pricing");
      const cta = page.getByTestId("one-time-report-cta");
      await cta.focus();
      await expect(cta).toBeFocused();
    });
  });
}
