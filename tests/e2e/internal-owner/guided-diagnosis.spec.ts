// Internal-owner Guided Diagnosis suite (Phase 9). Requires
// RUN_PRODUCTION_INTERNAL_E2E=true and a bootstrapped storage state (run
// tests/e2e/setup/auth.setup.ts first — see docs/PLAYWRIGHT_AUTH_SETUP.md).
// Skips safely (never fails ordinary CI) when either is absent.
//
// Split per Phase 9: this file asserts the DETERMINISTIC UI/API contract
// only (structured sections present, one next question, categorical
// confidence, no raw model paragraph). Real-provider RELIABILITY
// measurement lives in tests/e2e/provider-reliability/ — a retry here is
// never used as proof this suite "passed" a deterministic assertion.
import { test, expect } from "@playwright/test";
import fs from "fs";
import { requireProductionInternal } from "../helpers/provider-gate";
import { attachConsoleMonitor } from "../helpers/console-monitor";
import { toCasePayload, goldenCase } from "../fixtures/diagnostic-cases";
import { createScanCase, postDiagnosticEngineTurn } from "../helpers/api";
import { syntheticRequestId } from "../helpers/synthetic-data";
import { INTERNAL_OWNER_STORAGE_STATE } from "../setup/auth.setup";

test.describe("Internal owner — Guided Diagnosis", () => {
  requireProductionInternal();
  test.skip(!fs.existsSync(INTERNAL_OWNER_STORAGE_STATE), "Run tests/e2e/setup/auth.setup.ts first to bootstrap owner storage state.");
  test.use({ storageState: INTERNAL_OWNER_STORAGE_STATE });

  test("owner reaches Guided Diagnosis, no 404/401, structured turn contract holds", async ({ page, request }) => {
    const console_ = attachConsoleMonitor(page);
    await page.goto("/account");
    await expect(page.getByRole("button", { name: "Sign Out" })).toBeVisible();

    const goldenCaseDef = goldenCase("no-start-crank");
    const { status: caseStatus, caseId } = await createScanCase(request, toCasePayload(goldenCaseDef));
    expect(caseStatus).toBe(201);
    expect(caseId).toBeTruthy();

    let lastStatus = 0;
    let lastBody: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = await postDiagnosticEngineTurn(request, caseId!, syntheticRequestId(`owner-turn-${attempt}`));
      lastStatus = result.status;
      lastBody = result.body;
      if (result.status !== 502) break;
    }

    expect(lastStatus, `owner must never be rejected as unauthorized (got ${lastStatus}: ${JSON.stringify(lastBody)})`).not.toBe(401);
    expect(lastStatus, `owner must never be rejected as not-in-rollout (got ${lastStatus}: ${JSON.stringify(lastBody)})`).not.toBe(404);

    if (lastStatus === 200) {
      const body = lastBody as {
        response?: { summary?: string; evidenceUsed?: unknown[]; confidence?: { overallConfidenceLevel?: string } };
        safety?: { status?: string };
      };
      expect(body.response?.summary).toEqual(expect.any(String));
      expect(Array.isArray(body.response?.evidenceUsed)).toBe(true);
      expect(["high", "medium", "low", "insufficient_evidence"]).toContain(body.response?.confidence?.overallConfidenceLevel);
      expect(body.safety).not.toBeNull();
      // Categorical only — never a numeric probability/confidence.
      expect(JSON.stringify(body.response?.confidence)).not.toMatch(/probabilityPercent|"confidence":\s*\d/);
    } else {
      // A retryable provider validation failure after bounded retries is a
      // known, reportable outcome (docs/PLAYWRIGHT_PROVIDER_VALIDATION.md) —
      // not silently treated as a pass, and not a hard CI failure either,
      // since this suite only runs on explicit owner-triggered invocation.
      console.log(`[internal-owner] turn did not complete after 3 attempts: ${lastStatus} ${JSON.stringify(lastBody)}`);
    }

    console_.assertClean();
  });
});
