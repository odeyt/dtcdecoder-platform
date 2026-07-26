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
  // reset() clears registered RPC handlers too — re-register a fresh fake
  // of the shared ai_diagnostic_usage RPC before every test. Mirrors the
  // real record_ai_diagnostic_usage's logic closely enough for these
  // orchestration tests (see test/ai-diagnostics-usage.test.ts for the
  // dedicated unit tests of the usage module itself).
  fake().setRpcHandler("record_ai_diagnostic_usage", (args) => {
    const userId = args.p_user_id as string;
    const requestId = args.p_request_id as string;
    const feature = args.p_feature as string;
    const accessLevel = args.p_access_level as string;
    const dailyLimit = args.p_daily_limit as number | null;
    const monthlyLimit = args.p_monthly_limit as number | null;

    const rows = fake().dump("ai_diagnostic_usage");
    const already = rows.some((r) => r.user_id === userId && r.request_id === requestId);
    if (already) return "already_recorded";

    if (dailyLimit !== null) {
      const dailyCount = rows.filter((r) => r.user_id === userId && r.access_level === accessLevel).length;
      if (dailyCount >= dailyLimit) return "daily_limit_exceeded";
    }
    if (monthlyLimit !== null) {
      const monthlyCount = rows.filter((r) => r.user_id === userId && r.access_level === accessLevel).length;
      if (monthlyCount >= monthlyLimit) return "monthly_limit_exceeded";
    }

    fake().seed("ai_diagnostic_usage", [
      { user_id: userId, request_id: requestId, feature, access_level: accessLevel, created_at: new Date().toISOString() },
    ]);
    return "recorded";
  });
});

describe("runScanAnalysis", () => {
  it("happy path: transitions through analyzing to completed and persists a report", async () => {
    seedCase("case-1", "user-1");

    const result = await runScanAnalysis("user-1", "case-1", "pro", fakeProvider());

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

    await expect(runScanAnalysis("user-1", "case-2", "pro", failingProvider())).rejects.toThrow(
      "AI analysis failed",
    );

    const caseAfterFailure = fake().dump("scan_cases").find((c) => c.id === "case-2");
    expect(caseAfterFailure?.status).toBe("failed");

    const failedRuns = fake().dump("scan_ai_runs");
    expect(failedRuns).toHaveLength(1);
    expect(failedRuns[0].status).toBe("failed");

    // The failed attempt's reservation must have been released — otherwise
    // it would silently burn one of this user's daily report allowance for
    // nothing.
    expect(fake().dump("ai_diagnostic_usage").filter((r) => r.request_id === "case-2")).toHaveLength(0);

    // Retry with a working provider — must succeed without a second usage charge.
    const result = await runScanAnalysis("user-1", "case-2", "pro", fakeProvider());
    expect(result.case.status).toBe("completed");

    const usageRows = fake().dump("ai_diagnostic_usage");
    expect(usageRows.filter((r) => r.request_id === "case-2")).toHaveLength(1);
  });

  it("malformed AI structured output: handled safely, no crash, case fails with a controlled error", async () => {
    seedCase("case-malformed", "user-1");

    let caught: unknown;
    try {
      await runScanAnalysis("user-1", "case-malformed", "pro", malformedJsonProvider());
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

  it("free plan: blocked immediately — never reaches the AI provider or transitions the case", async () => {
    seedCase("case-free", "user-1");

    await expect(runScanAnalysis("user-1", "case-free", "free", fakeProvider())).rejects.toThrow(
      /free AI diagnostic previews/i,
    );

    const caseAfter = fake().dump("scan_cases").find((c) => c.id === "case-free");
    expect(caseAfter?.status).toBe("ready_for_analysis");

    const runsForCase = fake().dump("scan_ai_runs").filter((r) => r.case_id === "case-free");
    expect(runsForCase).toHaveLength(0);
  });

  it("pro plan: daily report limit exceeded — case stays ready_for_analysis and no AI run is created", async () => {
    seedCase("case-3", "user-1");
    seedCase("case-4", "user-1");
    seedCase("case-5", "user-1");
    seedCase("case-6", "user-1");

    // Pro gets 3 full AI diagnostic reports per day — consume it with three
    // other cases first.
    await runScanAnalysis("user-1", "case-3", "pro", fakeProvider());
    await runScanAnalysis("user-1", "case-4", "pro", fakeProvider());
    await runScanAnalysis("user-1", "case-5", "pro", fakeProvider());

    await expect(runScanAnalysis("user-1", "case-6", "pro", fakeProvider())).rejects.toThrow(
      /daily.*limit/i,
    );

    const case6 = fake().dump("scan_cases").find((c) => c.id === "case-6");
    expect(case6?.status).toBe("ready_for_analysis");

    const runsForCase6 = fake().dump("scan_ai_runs").filter((r) => r.case_id === "case-6");
    expect(runsForCase6).toHaveLength(0);
  });
});
