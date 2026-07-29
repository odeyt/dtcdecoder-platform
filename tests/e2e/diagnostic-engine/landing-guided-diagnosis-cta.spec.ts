// Landing-page "Start Guided Diagnosis" CTA (Phase 17). Previously a
// hardcoded `disabled` placeholder regardless of rollout tier or the
// signed-in user's eligibility — fixed this session
// (docs/DIAGNOSTIC_ENGINE_LANDING_BUTTON_FIX.md) to reflect real,
// server-computed access via HomePage's resolveGuidedDiagnosisAccess(),
// the same isDiagnosticEngineRolloutAllowed(email, isAdmin) check the real
// /turn API route uses. This file asserts the three resulting states.
// Server-side authorization remains authoritative in every case — the
// button's state never grants API access on its own (see
// tests/e2e/security/diagnostic-engine-auth.spec.ts and
// tests/e2e/auth/ordinary-user.spec.ts for the actual API-level proof).
import { test, expect } from "@playwright/test";
import fs from "fs";
import { requireProductionInternal } from "../helpers/provider-gate";
import { attachNetworkMonitor } from "../helpers/network-monitor";
import { INTERNAL_OWNER_STORAGE_STATE } from "../setup/auth.setup";

test.describe("Landing Guided Diagnosis CTA — anonymous", () => {
  test("shows a sign-in CTA, not a disabled placeholder, and never calls the provider", async ({ page }) => {
    const network = attachNetworkMonitor(page);
    await page.goto("/");
    const cta = page.getByRole("link", { name: "Start Guided Diagnosis" });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "/account/login");
    await page.waitForLoadState("networkidle");
    expect(network.diagnosticEngineTurnCalls).toHaveLength(0);
  });
});

test.describe("Landing Guided Diagnosis CTA — internal owner (eligible)", () => {
  requireProductionInternal();
  test.skip(!fs.existsSync(INTERNAL_OWNER_STORAGE_STATE), "Run tests/e2e/setup/auth.setup.ts first to bootstrap owner storage state.");
  test.use({ storageState: INTERNAL_OWNER_STORAGE_STATE });

  test("shows an enabled CTA that opens the real Guided Diagnosis panel, without itself calling the provider", async ({ page }) => {
    const network = attachNetworkMonitor(page);
    await page.goto("/");
    const cta = page.getByRole("button", { name: "Start Guided Diagnosis" });
    await expect(cta).toBeEnabled();

    await cta.click();
    // Opens the real DtcTechnicianShell dialog in guided mode — not a
    // provider call by itself (GuidedDiagnosisPanel's own runTurn() only
    // fires on the panel's own explicit action, verified separately).
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(network.diagnosticEngineTurnCalls).toHaveLength(0);
  });
});
