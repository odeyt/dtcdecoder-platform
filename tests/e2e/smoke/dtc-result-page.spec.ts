import { test, expect } from "@playwright/test";
import { attachConsoleMonitor } from "../helpers/console-monitor";

// DTC result-page redesign (docs/design/DTC_RESULT_PAGE.md).
//
// The assertions that matter most are about what is *absent*: the page used
// to render LOCKED_SECTION_CATALOG as nine placeholder cards, each with its
// own "Upgrade" button. Nine near-identical CTAs under grey skeleton rows
// read as a failed load rather than an offer, so "exactly one primary CTA"
// and "zero bare Upgrade buttons" are the real regression guards here.
//
// Nothing asserts per-cause reasoning, confidence, tools, or expected
// values: DtcCode stores flat strings and the page deliberately renders no
// such fields. A test for them could only pass against fabricated content.
//
// /dtc/P0420 is the same published fixture typography.spec.ts uses.
const RESULT_PATH = "/dtc/P0420";

const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "laptop-1024", width: 1024, height: 768 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-360", width: 360, height: 800 },
];

for (const viewport of VIEWPORTS) {
  test.describe(`DTC result page — ${viewport.name} (${viewport.width}x${viewport.height})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("renders constrained, with one conversion panel and no console errors", async ({ page }) => {
      const console_ = attachConsoleMonitor(page);
      const response = await page.goto(RESULT_PATH);
      expect(response?.status()).toBeLessThan(400);

      const article = page.getByTestId("dtc-result-page");
      await expect(article).toBeVisible();

      // No horizontal page overflow at any viewport.
      const overflowX = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflowX).toBe(false);

      // Report content is constrained rather than filling a wide viewport.
      // .container-report caps at 1140px; only meaningful above that width.
      if (viewport.width > 1200) {
        const width = (await article.boundingBox())?.width ?? 0;
        expect(width).toBeLessThanOrEqual(1160);
      }

      // Exactly one purchase action and one plans action.
      await expect(page.getByTestId("professional-report-cta")).toHaveCount(1);
      await expect(page.getByTestId("pro-plan-cta")).toHaveCount(1);
      await expect(page.getByTestId("professional-report-upsell")).toHaveCount(1);

      // The nine-card premium grid is gone. A small number of bare
      // "Upgrade" links legitimately remains: LockedResultPanel still backs
      // the *inline* locked sections (diagnostic steps, repair resources)
      // for free-tier visitors, and each of those carries one CTA. That is
      // intentional — only the nine-card block was replaced. The regression
      // being guarded is a wall of repeated CTAs, so this asserts a small
      // bound rather than zero, and that none of them sit in the panel.
      const upgradeLinks = page.getByRole("link", { name: "Upgrade", exact: true });
      expect(await upgradeLinks.count()).toBeLessThanOrEqual(2);
      await expect(
        page.getByTestId("professional-report-upsell").getByRole("link", { name: "Upgrade", exact: true }),
      ).toHaveCount(0);

      // Old terminology is gone from the customer-facing page.
      await expect(page.getByText("Unlock Full AI Diagnosis")).toHaveCount(0);
      await expect(page.getByText("Run Full AI Diagnosis")).toHaveCount(0);

      // Covers console.error and uncaught page errors, including hydration
      // failures — the signature that would matter most for a page whose
      // primary CTA is a client component.
      console_.assertClean();
    });

    test("ranks causes with visible numbers and a single most-likely marker", async ({ page }) => {
      await page.goto(RESULT_PATH);

      const causes = page.getByTestId("most-likely-causes");
      await expect(causes).toBeVisible();

      // Rank is real text, so it survives with colour and badges ignored.
      await expect(causes.getByTestId("ranked-cause-1")).toBeVisible();
      await expect(causes.getByText("#1")).toBeVisible();

      // Only the top cause carries the badge. Scoped to the list, not the
      // section: the section's own heading is "Most likely causes", which
      // would otherwise match this text too.
      const list = causes.getByTestId("ranked-cause-list");
      await expect(list.getByText(/most likely/i)).toHaveCount(1);
      await expect(list.getByTestId("ranked-cause-1").getByText(/most likely/i)).toHaveCount(1);

      // Ranked causes are an ordered list, not a stack of divs.
      await expect(causes.locator("ol")).toHaveCount(1);
    });

    test("keeps the conversion panel's CTAs usable at this size", async ({ page }) => {
      await page.goto(RESULT_PATH);

      const cta = page.getByTestId("professional-report-cta");
      await cta.scrollIntoViewIfNeeded();
      await expect(cta).toBeVisible();

      const box = await cta.boundingBox();
      // 44px minimum touch target at every viewport.
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

      // Primary CTA goes full width on phones and sits inline above them.
      if (viewport.width <= 390) {
        const panelWidth = (await page.getByTestId("professional-report-upsell").boundingBox())?.width ?? 0;
        expect((box?.width ?? 0) / panelWidth).toBeGreaterThan(0.8);
      }

      // The canonical one-time price, sourced from pricing.ts — a second
      // hardcoded figure elsewhere would fail here.
      await expect(cta).toContainText("$6.99");

      // Keyboard focus is visible on the primary action.
      await cta.focus();
      const outline = await cta.evaluate((el) => {
        const s = getComputedStyle(el);
        return `${s.outlineStyle}|${s.outlineWidth}`;
      });
      expect(outline).not.toContain("none|");
    });
  });
}

test.describe("DTC result page — screenshots", () => {
  const SHOTS = [
    { name: "desktop-1440", width: 1440, height: 900 },
    { name: "tablet-768", width: 768, height: 1024 },
    { name: "mobile-390", width: 390, height: 844 },
  ];

  for (const shot of SHOTS) {
    test(`full page @ ${shot.name}`, async ({ page }) => {
      await page.setViewportSize({ width: shot.width, height: shot.height });
      await page.goto(RESULT_PATH);
      await page.getByTestId("dtc-result-page").waitFor();
      await page.screenshot({
        path: `test-results/artifacts/dtc-result-full-${shot.name}.png`,
        fullPage: true,
      });
    });
  }

  test("conversion panel @ desktop-1440", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(RESULT_PATH);
    const panel = page.getByTestId("professional-report-upsell");
    await panel.scrollIntoViewIfNeeded();
    await panel.screenshot({ path: "test-results/artifacts/dtc-result-upsell-desktop-1440.png" });
  });

  test("most likely causes @ desktop-1440", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(RESULT_PATH);
    const causes = page.getByTestId("most-likely-causes");
    await causes.scrollIntoViewIfNeeded();
    await causes.screenshot({ path: "test-results/artifacts/dtc-result-causes-desktop-1440.png" });
  });
});
