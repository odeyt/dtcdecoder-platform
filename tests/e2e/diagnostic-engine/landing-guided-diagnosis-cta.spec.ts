// Landing-page CTA safety properties. Originally (Phase 17) asserted the
// old LandingDtcTechnician hero's "Start Guided Diagnosis" button reflected
// real server-computed eligibility instead of a hardcoded disabled
// placeholder. That whole component and its
// resolveGuidedDiagnosisAccess()-driven button state were retired when the
// landing hero was replaced by the "Diagnostic Intake Console"
// (ServiceBayHero) — every visitor, signed in or not, now sees the same
// entry cards, so there is no more eligibility-gated CTA on the landing
// page to test. The internal-owner "eligible" scenario this file used to
// cover has no landing-page equivalent anymore; the real authenticated
// Guided Diagnosis flow (DtcTechnicianShell, mounted globally in the app
// shell, unrelated to the landing hero) is already covered end-to-end by
// tests/e2e/internal-owner/guided-diagnosis.spec.ts — no coverage is lost.
//
// What remains landing-page-specific and still worth asserting: the intake
// console never calls the paid diagnostic-engine provider from the landing
// page itself, and a flow that needs an account (viewing diagnostic
// history) correctly redirects an anonymous visitor to sign-in rather than
// silently proceeding.
import { test, expect } from "@playwright/test";
import { attachNetworkMonitor } from "../helpers/network-monitor";

test.describe("Landing Diagnostic Intake Console — anonymous", () => {
  test("renders an ungated entry point and never calls the paid provider on load", async ({ page }) => {
    const network = attachNetworkMonitor(page);
    await page.goto("/");

    const cta = page.getByRole("link", { name: "Start Diagnosis" });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "#diagnostic-intake-console");

    await page.waitForLoadState("networkidle");
    expect(network.diagnosticEngineTurnCalls).toHaveLength(0);
  });

  test("Continue a previous diagnosis redirects to sign-in instead of proceeding, and never calls the paid provider", async ({ page }) => {
    const network = attachNetworkMonitor(page);
    await page.goto("/");

    await page.getByRole("button", { name: "Continue a previous diagnosis" }).click();

    // Scoped to the console panel — SiteNav also has its own "Sign In" link
    // for an anonymous visitor, so an unscoped query is ambiguous.
    const signInLink = page.locator("#diagnostic-intake-console").getByRole("link", { name: "Sign In" });
    await expect(signInLink).toBeVisible();
    const href = await signInLink.getAttribute("href");
    expect(href).toMatch(/^\/account\/login/);

    await page.waitForLoadState("networkidle");
    expect(network.diagnosticEngineTurnCalls).toHaveLength(0);
  });
});
