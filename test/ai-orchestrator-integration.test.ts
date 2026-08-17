// Integration coverage for the orchestrated analyze flow
// (docs/MULTI_MODEL_ORCHESTRATOR.md) — runScanAnalysis with
// AI_ORCHESTRATOR_ENABLED=true, using fake primary/reviewer providers
// injected through a mocked registry (the orchestrator never uses the
// `provider` argument runScanAnalysis receives once the flag is on — it
// resolves providers itself via registry.ts). Mirrors the existing
// non-orchestrated coverage in test/scan-analyze-route.test.ts, which stays
// unchanged and proves the flag-off path is byte-for-byte the same as
// before this feature existed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";
import type { DiagnosticAIProvider, DiagnosticAIProviderResult, DiagnosticReviewer } from "@/lib/scan-diagnostics/ai/provider";
import type { DiagnosticAiOutput } from "@/lib/scan-diagnostics/schemas";
import type { DiagnosticReview } from "@/lib/scan-diagnostics/ai/review-schema";

vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabaseOrch = fake;
  return { createAdminClient: () => fake };
});

const registryState: {
  primary: DiagnosticAIProvider;
  reviewer: DiagnosticReviewer | null;
} = { primary: null as unknown as DiagnosticAIProvider, reviewer: null };

vi.mock("@/lib/scan-diagnostics/ai/registry", () => ({
  getPrimaryProvider: () => registryState.primary,
  getReviewerProvider: () => registryState.reviewer,
  getMultimodalProvider: () => null,
}));

const { runScanAnalysis } = await import("@/lib/scan-diagnostics/analyze");

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabaseOrch as FakeSupabase;
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

function fakePrimaryProvider(id = "openai-primary", overrides: Partial<DiagnosticAIProviderResult> = {}): DiagnosticAIProvider {
  return {
    id,
    async runDiagnosis() {
      return {
        providerId: id,
        modelId: "fake-model",
        promptVersion: "2026-07-safety-v2",
        output: VALID_OUTPUT,
        tokens: { input: 100, output: 200 },
        ...overrides,
      };
    },
  };
}

function failingPrimaryProvider(): DiagnosticAIProvider {
  return {
    id: "openai-primary",
    async runDiagnosis() {
      throw new Error("simulated OpenAI outage");
    },
  };
}

function fakeReviewer(id: string, review: DiagnosticReview, tokens = { input: 50, output: 50 }): DiagnosticReviewer {
  return { id, async review() { return { review, tokens }; } };
}

function failingReviewer(): DiagnosticReviewer {
  return { id: "test-reviewer", async review() { throw new Error("simulated reviewer outage"); } };
}

function approvedReview(overrides: Partial<DiagnosticReview> = {}): DiagnosticReview {
  return {
    decision: "approved",
    unsupportedClaims: [],
    missedCauses: [],
    unsafeRecommendations: [],
    testOrderCorrections: [],
    confidenceAdjustment: { original: 70, revised: 70, reason: "no change needed" },
    correctedFields: [],
    reviewerSummary: "Assessment is well-supported.",
    ...overrides,
  };
}

function seedCase(caseId: string, userId: string, opts: { safetyCriticalSystem?: boolean } = {}) {
  fake().seed("scan_cases", [
    {
      id: caseId,
      user_id: userId,
      status: "ready_for_analysis",
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
      id: `ext-${caseId}`,
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
    { id: `dtc-${caseId}`, case_id: caseId, module: "ECM", code: "P0171", status: "current", description_raw: null },
  ]);
  if (opts.safetyCriticalSystem) {
    fake().seed("scan_systems", [
      {
        id: `sys-${caseId}`,
        case_id: caseId,
        system_name: "SRS Airbag System",
        module_name: null,
        status: "faulted",
        dtc_count_reported: 1,
        dtc_count_extracted: 1,
        extraction_complete: true,
      },
    ]);
  }
}

const ENV_KEYS = ["AI_ORCHESTRATOR_ENABLED", "AI_REVIEW_CONFIDENCE_THRESHOLD", "AI_QUALITY_AUDIT_PERCENT"] as const;
const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  fake().reset();
  fake().setRpcHandler("record_ai_diagnostic_usage", (args) => {
    const userId = args.p_user_id as string;
    const requestId = args.p_request_id as string;
    const rows = fake().dump("ai_diagnostic_usage");
    if (rows.some((r) => r.user_id === userId && r.request_id === requestId)) return "already_recorded";
    fake().seed("ai_diagnostic_usage", [
      { user_id: userId, request_id: requestId, feature: args.p_feature, access_level: args.p_access_level, created_at: new Date().toISOString() },
    ]);
    return "recorded";
  });

  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
  process.env.AI_ORCHESTRATOR_ENABLED = "true";
  // Isolate the trigger under test: nothing escalates via confidence or
  // random quality-audit sampling unless a test explicitly wants it to —
  // escalation in these tests is driven by seeding a safety-critical system.
  process.env.AI_REVIEW_CONFIDENCE_THRESHOLD = "0";
  process.env.AI_QUALITY_AUDIT_PERCENT = "0";

  registryState.primary = fakePrimaryProvider();
  registryState.reviewer = null;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe("orchestrated scan analysis — AI_ORCHESTRATOR_ENABLED=true", () => {
  it("primary-only: no safety-critical system, no escalation, routing decision persisted", async () => {
    seedCase("case-1", "user-1");
    registryState.primary = fakePrimaryProvider("openai-primary");

    const result = await runScanAnalysis("user-1", "case-1", "pro", fakePrimaryProvider());
    expect(result.case.status).toBe("completed");

    const decisions = fake().dump("ai_routing_decisions");
    expect(decisions).toHaveLength(1);
    expect(decisions[0].reason_code).toBe("PRIMARY_ONLY");
    expect(decisions[0].primary_provider).toBe("openai-primary");
    expect(decisions[0].reviewer_provider).toBeNull();
    expect(decisions[0].escalated).toBe(false);
  });

  it("safety-critical current fault escalates to the reviewer, which approves unchanged", async () => {
    seedCase("case-2", "user-1", { safetyCriticalSystem: true });
    registryState.reviewer = fakeReviewer("test-reviewer", approvedReview());

    const result = await runScanAnalysis("user-1", "case-2", "pro", fakePrimaryProvider());
    expect(result.case.status).toBe("completed");

    const decisions = fake().dump("ai_routing_decisions");
    expect(decisions[0].reason_code).toBe("SAFETY_CRITICAL");
    expect(decisions[0].escalated).toBe(true);
    expect(decisions[0].reviewer_provider).toBe("test-reviewer");
  });

  it("reviewer's correctedFields are deterministically applied to the persisted report", async () => {
    seedCase("case-3", "user-1", { safetyCriticalSystem: true });
    registryState.reviewer = fakeReviewer(
      "test-reviewer",
      approvedReview({
        decision: "approved_with_changes",
        correctedFields: [{ path: "rankedCauses.0.rationale", replacement: "Confirmed by fuel trim data", reason: "clarify" }],
      }),
    );

    const result = await runScanAnalysis("user-1", "case-3", "pro", fakePrimaryProvider());
    expect((result.report.ranked_causes as unknown as DiagnosticAiOutput["rankedCauses"])[0].rationale).toBe(
      "Confirmed by fuel trim data",
    );
  });

  it("reviewer decision human_review_required adds a visible safety warning to the final report", async () => {
    seedCase("case-4", "user-1", { safetyCriticalSystem: true });
    registryState.reviewer = fakeReviewer("test-reviewer", approvedReview({ decision: "human_review_required" }));

    const result = await runScanAnalysis("user-1", "case-4", "pro", fakePrimaryProvider());
    expect(JSON.stringify(result.report.missing_information)).toMatch(/qualified technician/i);
  });

  it("reviewer call failure falls back to the unreviewed primary result — case still completes, no crash", async () => {
    seedCase("case-5", "user-1", { safetyCriticalSystem: true });
    registryState.reviewer = failingReviewer();

    const result = await runScanAnalysis("user-1", "case-5", "pro", fakePrimaryProvider());
    expect(result.case.status).toBe("completed");

    const decisions = fake().dump("ai_routing_decisions");
    expect(decisions[0].reason_code).toBe("PROVIDER_FAILURE");
  });

  it("reviewer unavailable (getReviewerProvider() returns null) even when routing wants to escalate: primary result stands, no reviewer call", async () => {
    seedCase("case-6", "user-1", { safetyCriticalSystem: true });
    registryState.reviewer = null;

    const result = await runScanAnalysis("user-1", "case-6", "pro", fakePrimaryProvider());
    expect(result.case.status).toBe("completed");

    const decisions = fake().dump("ai_routing_decisions");
    expect(decisions[0].escalated).toBe(false);
    expect(decisions[0].explanation).toMatch(/disabled/i);
  });

  it("primary provider failure still fails the case exactly like the non-orchestrated path (usage released, no ai_routing_decisions row)", async () => {
    seedCase("case-7", "user-1");
    registryState.primary = failingPrimaryProvider();

    await expect(runScanAnalysis("user-1", "case-7", "pro", fakePrimaryProvider())).rejects.toThrow("AI analysis failed");

    const caseAfter = fake().dump("scan_cases").find((c) => c.id === "case-7");
    expect(caseAfter?.status).toBe("failed");
    expect(fake().dump("ai_diagnostic_usage").filter((r) => r.request_id === "case-7")).toHaveLength(0);
    expect(fake().dump("ai_routing_decisions")).toHaveLength(0);
  });

  it("AI_ORCHESTRATOR_ENABLED=false: registry is never consulted, existing single-provider path runs unchanged", async () => {
    process.env.AI_ORCHESTRATOR_ENABLED = "false";
    seedCase("case-8", "user-1");
    // Deliberately leave registryState.primary pointed at a provider that
    // would throw if ever called, to prove the disabled path never touches it.
    registryState.primary = failingPrimaryProvider();

    const result = await runScanAnalysis("user-1", "case-8", "pro", fakePrimaryProvider("unused-provider-id"));
    expect(result.case.status).toBe("completed");
    expect(fake().dump("ai_routing_decisions")).toHaveLength(0);
  });
});
