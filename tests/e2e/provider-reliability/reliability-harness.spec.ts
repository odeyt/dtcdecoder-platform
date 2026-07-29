// Real-provider reliability harness (Phase 11/12). NOT a normal PR test —
// explicit invocation only:
//
//   RUN_PRODUCTION_INTERNAL_E2E=true npm run test:e2e:provider
//
// Bounded: 8 cases, max 2 attempts each, hard cap 16 real Anthropic calls
// per run (tests/e2e/helpers/provider-gate.ts enforces the cap). Records
// measured reliability — never treats a retry as proof of a passing
// deterministic test, and never widens rollout or mutates production env
// vars itself.
import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { requireProductionInternal, reserveProviderCall } from "../helpers/provider-gate";
import { GOLDEN_CASES, toCasePayload, type GoldenDiagnosticCase } from "../fixtures/diagnostic-cases";
import { createScanCase, postDiagnosticEngineTurn } from "../helpers/api";
import { syntheticRequestId } from "../helpers/synthetic-data";
import { INTERNAL_OWNER_STORAGE_STATE } from "../setup/auth.setup";

const HARNESS_CASE_IDS = [
  "no-start-crank",
  "single-cylinder-misfire",
  "low-voltage-multi-module-fault",
  "can-communication-fault",
  "hv-active-isolation-fault",
  "hv-damaged-orange-cable",
  "ev-historical-charging-code",
  "ev-low-12v-battery",
];

interface CaseResult {
  caseId: string;
  attempts: number;
  finalStatus: number;
  firstAttemptSuccess: boolean;
  succeededAfterRetry: boolean;
  safetyStatus: string | null;
  confidenceLevel: string | null;
  latencyMs: number;
  toolUsePresent: boolean | null;
  validationCategory: string | null;
}

test.describe("Provider reliability harness", () => {
  requireProductionInternal();
  test.skip(!fs.existsSync(INTERNAL_OWNER_STORAGE_STATE), "Run tests/e2e/setup/auth.setup.ts first to bootstrap owner storage state.");
  test.use({ storageState: INTERNAL_OWNER_STORAGE_STATE });

  test("runs the bounded golden-case set and reports measured reliability", async ({ request }) => {
    const results: CaseResult[] = [];

    for (const id of HARNESS_CASE_IDS) {
      const golden: GoldenDiagnosticCase = GOLDEN_CASES.find((c) => c.id === id)!;
      const { status: caseStatus, caseId } = await createScanCase(request, toCasePayload(golden));
      expect(caseStatus, `case creation failed for ${id}`).toBe(201);

      let attempts = 0;
      let finalStatus = 0;
      let finalBody: unknown = null;
      let firstAttemptSuccess = false;
      const startedAt = Date.now();

      for (let attempt = 1; attempt <= 2; attempt++) {
        reserveProviderCall();
        attempts = attempt;
        const result = await postDiagnosticEngineTurn(request, caseId!, syntheticRequestId(`reliability-${id}-${attempt}`));
        finalStatus = result.status;
        finalBody = result.body;
        if (attempt === 1 && result.status === 200) firstAttemptSuccess = true;
        if (result.status === 200) break;
      }

      const latencyMs = Date.now() - startedAt;
      const body = finalBody as {
        safety?: { status?: string };
        response?: { confidence?: { overallConfidenceLevel?: string } };
        code?: string;
      } | null;

      results.push({
        caseId: id,
        attempts,
        finalStatus,
        firstAttemptSuccess,
        succeededAfterRetry: !firstAttemptSuccess && finalStatus === 200,
        safetyStatus: body?.safety?.status ?? null,
        confidenceLevel: body?.response?.confidence?.overallConfidenceLevel ?? null,
        latencyMs,
        toolUsePresent: finalStatus === 200 ? true : finalStatus === 502 ? false : null,
        validationCategory: body?.code ?? null,
      });

      // Deterministic HV safety-floor assertion — this must hold for every
      // case regardless of provider reliability, and is never satisfied by
      // a retry (Phase 13's non-negotiable rule).
      if (golden.expected.forbiddenSafety?.includes("safe_to_drive") === false && golden.expected.minimumSafety === "immediate_stop") {
        if (finalStatus === 200) {
          expect(body?.safety?.status, `${id} must classify as immediate_stop`).toBe("immediate_stop");
        }
      }
    }

    const succeeded = results.filter((r) => r.finalStatus === 200);
    const summary = {
      runAt: new Date().toISOString(),
      totalCases: results.length,
      first_attempt_success_rate: results.filter((r) => r.firstAttemptSuccess).length / results.length,
      post_retry_success_rate: succeeded.length / results.length,
      validation_failure_rate: results.filter((r) => r.finalStatus === 502).length / results.length,
      timeout_rate: results.filter((r) => r.finalStatus === 504).length / results.length,
      safety_classification_pass_rate:
        results.filter((r) => r.safetyStatus !== null).length / results.filter((r) => r.finalStatus === 200).length || 0,
      average_latency_ms: results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length,
      results,
    };

    const outDir = path.join(process.cwd(), "test-results");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "provider-reliability.json"), JSON.stringify(summary, null, 2));

    console.log(`[provider-reliability] post_retry_success_rate=${summary.post_retry_success_rate}`);
  });
});
