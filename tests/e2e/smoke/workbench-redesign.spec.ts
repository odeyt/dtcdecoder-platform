// Final verification for the Diagnostic Workbench redesign (11-section
// scan report — see the "feat: Diagnostic Workbench" commit and
// docs/design/ — this repo's own convention every other feature this
// session got, that this one never did). Seeds a real "completed",
// full-access case directly via the admin client (seedCompletedWorkbenchCase
// — no real OpenAI call) and drives the actual page through
// ScanReportView's real server-side data pipeline: getCaseDetail,
// resolveReportAccess, buildCanonicalVehicleScan, computeDiagnosticPriority,
// workbench state — nothing here is mocked at the component level.
import { test, expect } from "@playwright/test";
import { signInWithPassword, signOut } from "../helpers/auth";
import { syntheticEmail } from "../helpers/synthetic-data";
import { createSyntheticUser, cleanupSyntheticUsers } from "../helpers/database-cleanup";
import { seedCompletedWorkbenchCase, cleanupWorkbenchCase } from "../fixtures/workbench-case";
import { attachConsoleMonitor } from "../helpers/console-monitor";

const hasSupabaseAdmin = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

// Every one of the redesign's 11 named sections, by its real h2 text (see
// messages/en.json's scanReport namespace) — proves the whole report
// actually renders end to end, not just that the page loads.
const SECTION_HEADINGS = [
  /status summary/i,
  /vehicle information/i,
  /vehicle health summary/i,
  /priority findings/i,
  /customer complaint/i,
  /evidence panel/i,
  /likely causes/i,
  /repair recommendation/i,
  /interactive diagnostic test plan/i,
  /technician notes/i,
  /verification checklist/i,
  /case completion/i,
];

const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "mobile-390", width: 390, height: 844 },
];

test.describe("Diagnostic Workbench redesign — final verification", () => {
  test.skip(!hasSupabaseAdmin, "Supabase admin credentials not configured — skipping (see docs/PLAYWRIGHT_AUTH_SETUP.md).");

  let userId: string | null = null;
  let caseId: string | null = null;
  const email = syntheticEmail("workbench");
  const password = `E2eWb!${Math.random().toString(36).slice(2)}9`;

  test.beforeAll(async () => {
    userId = await createSyntheticUser(email, password);
    if (userId) {
      const seeded = await seedCompletedWorkbenchCase(userId);
      caseId = seeded.caseId;
    }
  });

  test.afterAll(async () => {
    if (caseId) await cleanupWorkbenchCase(caseId);
    if (userId) await cleanupSyntheticUsers([userId]);
  });

  // A single test signing in once and looping over viewports internally —
  // not one test per viewport — because each `test()` gets a brand-new
  // page/browser context in Playwright, so 3 separate tests would mean 3
  // separate sign-ins for the same synthetic account in quick succession.
  // Confirmed empirically that trips Supabase Auth's own sign-in rate
  // limiting (the first sign-in always succeeds; a second one moments
  // later hangs past 15s waiting for "Sign Out" to appear). Changing
  // viewport + reloading within the same page never needs a fresh session.
  test("renders all 11 sections with no console errors or overflow, at every required viewport", async ({ page }) => {
    // This page's render path is genuinely heavier than a typical smoke
    // page — getCaseDetail + resolveReportAccess + buildCanonicalVehicleScan
    // + computeDiagnosticPriority, ~30 translation lookups, and 5+ Workbench
    // subcomponents (LikelyCauses/TestPlan/TechnicianNotes/Verification/
    // CaseCompletion) all compiling on first hit under Turbopack dev mode.
    // Scoped to this spec only, not the shared config's default.
    test.setTimeout(120_000);
    page.setDefaultNavigationTimeout(90_000);

    const console_ = attachConsoleMonitor(page);

    await signInWithPassword(page, email, password);

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`/diagnostics/${caseId}`);

      await expect(page.getByTestId("diagnostic-report-content")).toBeVisible();
      await expect(page.getByTestId("scan-analysis-content")).toBeVisible();

      for (const heading of SECTION_HEADINGS) {
        await expect(page.getByRole("heading", { level: 2, name: heading })).toBeVisible();
      }

      // The two real DTCs seeded should appear somewhere in the rendered
      // report (fault categories, DTC list, likely-causes rationale, etc.)
      await expect(page.getByText("P0420", { exact: false }).first()).toBeVisible();
      await expect(page.getByText("P0171", { exact: false }).first()).toBeVisible();

      const debugInfo = await page.evaluate(() => {
        const clientWidth = document.documentElement.clientWidth;
        // Elements whose OWN content overflows their OWN box (the true
        // source), not just elements positioned past the viewport edge —
        // a wide descendant can inflate document.scrollWidth without any
        // single element's getBoundingClientRect().right exceeding
        // clientWidth, if intermediate ancestors clip/scroll it locally.
        const candidates: { tag: string; cls: string; gap: number; scrollWidth: number; clientWidth: number; position: string; text: string }[] = [];
        document.querySelectorAll("body *").forEach((el) => {
          const gap = el.scrollWidth - el.clientWidth;
          if (gap > 2) {
            candidates.push({
              tag: el.tagName,
              cls: (el.className || "").toString().slice(0, 100),
              gap,
              scrollWidth: el.scrollWidth,
              clientWidth: el.clientWidth,
              position: getComputedStyle(el).position,
              text: el.textContent ? el.textContent.slice(0, 80) : "",
            });
          }
        });
        candidates.sort((a, b) => b.gap - a.gap);
        return {
          innerWidth: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth,
          candidates: candidates.slice(0, 10),
        };
      });
      console.log(`[DEBUG ${viewport.name}]`, JSON.stringify(debugInfo, null, 2));

      const overflow = debugInfo.scrollWidth > debugInfo.clientWidth + 1;
      expect(overflow).toBe(false);

      await page.screenshot({
        path: `test-results/artifacts/workbench-redesign-${viewport.name}.png`,
        fullPage: true,
      });
    }

    console_.assertClean();
    await signOut(page);
  });
});
