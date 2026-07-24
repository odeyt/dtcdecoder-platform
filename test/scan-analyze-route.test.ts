import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";
import type { DiagnosticAIProvider, DiagnosticAIProviderResult } from "@/lib/scan-diagnostics/ai/provider";
import type { DiagnosticAiOutput } from "@/lib/scan-diagnostics/schemas";

vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabase = fake;
  return { createAdminClient: () => fake };
});

const { runScanAnalysis } = await import("@/lib/scan-diagnostics/analyze");

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

const VALID_OUTPUT: DiagnosticAiOutput = {
  summary: "Likely a vacuum leak.",
  rankedCauses: [
    {
      cause: "Vacuum leak",
      confidenceLevel: "medium",
      rationale: "P0171 lean code",
      supportingEvidence: [],
      contradictingEvidence: [],
      confirmationTestsRequired: ["Smoke test"],
    },
  ],
  recommendedTests: [{ step: "Smoke test", purpose: "Find leak", expectedResult: "Smoke visible at leak" }],
  safetyWarnings: [],
  missingInformation: [],
};

function fakeProvider(overrides: Partial<DiagnosticAIProviderResult> = {}): DiagnosticAIProvider {
  return {
    id: "fake-provider",
    async runDiagnosis() {
      return {
        providerId: "fake-provider",
        modelId: "fake-model",
        promptVersion: "2026-07-safety-v2",
        output: VALID_OUTPUT,
        tokens: { input: 100, output: 200 },
        ...overrides,
      };
    },
  };
}

function failingProvider(): DiagnosticAIProvider {
  return {
    id: "fake-provider",
    async runDiagnosis() {
      throw new Error("simulated provider outage");
    },
  };
}

function malformedJsonProvider(): DiagnosticAIProvider {
  return {
    id: "fake-provider",
    async runDiagnosis() {
      // Simulates AnthropicDiagnosticProvider's own AiResponseValidationError
      // path (missing tool_use block, or a safeParse failure) — the
      // orchestrator must handle this exactly like any other provider
      // failure: no crash, case moves to "failed", usage isn't double-charged.
      const { AiResponseValidationError } = await import("@/lib/scan-diagnostics/api-errors");
      throw new AiResponseValidationError("Model did not return a structured tool call.");
    },
  };
}

function seedCase(caseId: string, userId: string, status = "ready_for_analysis") {
  fake().seed("scan_cases", [
    {
      id: caseId,
      user_id: userId,
      status,
      complaint: "Check engine light",
      symptoms: ["rough idle"],
      mileage: 60000,
      recent_repairs: null,
      battery_condition: null,
      technician_notes: null,
    },
  ]);
  fake().seed("scan_extractions", [
    {
      id: "ext-1",
      case_id: caseId,
      vin: "1FTFW1ET1EFA00001",
      make: "Ford",
      model: "F-150",
      model_year: 2019,
      engine: null,
      odometer_miles: 60000,
      modules: [],
      freeze_frame: [],
      live_data: [],
      image_only_pdf: false,
      warnings: [],
      reviewed_fields: {},
    },
  ]);
  fake().seed("scan_dtc_records", [
    { id: "dtc-1", case_id: caseId, module: "ECM", code: "P0171", status: "current", description_raw: null },
  ]);
}

beforeEach(() => {
  fake().reset();
  // reset() clears registered RPC handlers too — re-register a fresh
  // per-user ledger simulation before every test.
  const consumedByUser = new Map<string, Set<string>>();
  fake().setRpcHandler("consume_scan_usage_slot", (args) => {
    const userId = args.p_user_id as string;
    const caseId = args.p_case_id as string;
    const limit = args.p_limit as number;
    const consumed = consumedByUser.get(userId) ?? new Set<string>();
    consumedByUser.set(userId, consumed);
    if (consumed.has(caseId)) return true;
    if (consumed.size >= limit) return false;
    consumed.add(caseId);
    // Mirrors the real consume_scan_usage_slot RPC's ledger insert so
    // assertions can inspect the scan_usage table directly, not just the
    // in-memory decision logic above.
    fake().seed("scan_usage", [{ case_id: caseId, user_id: userId }]);
    return true;
  });
  fake().setRpcHandler("get_monthly_scan_usage", (args) => consumedByUser.get(args.p_user_id as string)?.size ?? 0);
});

describe("runScanAnalysis", () => {
  it("happy path: transitions through analyzing to completed and persists a report", async () => {
    seedCase("case-1", "user-1");

    const result = await runScanAnalysis("user-1", "case-1", "free", fakeProvider());

    expect(result.case.status).toBe("completed");
    expect(["high", "medium", "low", "insufficient_evidence"]).toContain(result.report.confidence_level);
    expect(result.report.schema_version).toBe("2.0");
    expect(result.report.ranked_causes).toHaveLength(1);

    const runs = fake().dump("scan_ai_runs");
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("completed");
    expect(runs[0].prompt_version).toBe("2026-07-safety-v2");
  });

  it("provider failure: case ends up failed, and a retry does not double-charge usage", async () => {
    seedCase("case-2", "user-1");

    await expect(runScanAnalysis("user-1", "case-2", "free", failingProvider())).rejects.toThrow(
      "AI analysis failed",
    );

    const caseAfterFailure = fake().dump("scan_cases").find((c) => c.id === "case-2");
    expect(caseAfterFailure?.status).toBe("failed");

    const failedRuns = fake().dump("scan_ai_runs");
    expect(failedRuns).toHaveLength(1);
    expect(failedRuns[0].status).toBe("failed");

    // Retry with a working provider — must succeed without a second usage charge.
    const result = await runScanAnalysis("user-1", "case-2", "free", fakeProvider());
    expect(result.case.status).toBe("completed");

    const usageRows = fake().dump("scan_usage");
    expect(usageRows.filter((r) => r.case_id === "case-2")).toHaveLength(1);
  });

  it("malformed AI structured output: handled safely, no crash, case fails with a controlled error", async () => {
    seedCase("case-malformed", "user-1");

    let caught: unknown;
    try {
      await runScanAnalysis("user-1", "case-malformed", "free", malformedJsonProvider());
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    const { ScanAnalysisFailedError } = await import("@/lib/scan-diagnostics/api-errors");
    expect(caught).toBeInstanceOf(ScanAnalysisFailedError);
    expect((caught as InstanceType<typeof ScanAnalysisFailedError>).code).toBe("AI_RESPONSE_VALIDATION_FAILED");
    expect((caught as InstanceType<typeof ScanAnalysisFailedError>).retryable).toBe(true);

    const caseAfter = fake().dump("scan_cases").find((c) => c.id === "case-malformed");
    expect(caseAfter?.status).toBe("failed");
  });

  it("usage limit exceeded: case stays ready_for_analysis and no AI run is created", async () => {
    seedCase("case-3", "user-1");
    seedCase("case-4", "user-1");
    seedCase("case-5", "user-1");

    // Free plan limit is 2/month — consume it with two other cases first.
    await runScanAnalysis("user-1", "case-3", "free", fakeProvider());
    await runScanAnalysis("user-1", "case-4", "free", fakeProvider());

    await expect(runScanAnalysis("user-1", "case-5", "free", fakeProvider())).rejects.toThrow(/allowance/i);

    const case5 = fake().dump("scan_cases").find((c) => c.id === "case-5");
    expect(case5?.status).toBe("ready_for_analysis");

    const runsForCase5 = fake().dump("scan_ai_runs").filter((r) => r.case_id === "case-5");
    expect(runsForCase5).toHaveLength(0);
  });
});
