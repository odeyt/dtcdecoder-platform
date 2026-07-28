import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";
import type { DiagnosticAIProvider, DiagnosticAIProviderResult } from "@/lib/scan-diagnostics/ai/provider";
import type { DiagnosticAiOutput } from "@/lib/scan-diagnostics/schemas";

vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabase = fake;
  return { createAdminClient: () => fake };
});

const { runDiagnosticEngineTurn, DiagnosticEngineProviderUnsupportedError } = await import("@/lib/diagnostic-engine/orchestrator");
const { ScanCaseNotFoundError } = await import("@/lib/scan-diagnostics/api-errors");

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

let requestCounter = 0;
function defaultBilling(overrides: Partial<{ plan: "free" | "pro" | "workshop"; email: string | null; rolloutTier: "disabled" | "internal_only" | "allowlist_only" | "all_paid_users"; requestId: string }> = {}) {
  requestCounter += 1;
  return {
    plan: "workshop" as const,
    email: "tester@example.com",
    rolloutTier: "all_paid_users" as const,
    requestId: `req-${requestCounter}`,
    ...overrides,
  };
}

const FLAG_NAMES = [
  "DIAGNOSTIC_GRAPH_ENABLED",
  "QUESTION_ENGINE_ENABLED",
  "PROBABILITY_ENGINE_ENABLED",
  "CONFIDENCE_ENGINE_ENABLED",
  "TEST_PLANNER_ENABLED",
  "REPAIR_VERIFICATION_ENABLED",
];

function setFlags(on: string[]) {
  for (const name of FLAG_NAMES) {
    if (on.includes(name)) process.env[name] = "true";
    else delete process.env[name];
  }
}

const VALID_OUTPUT: DiagnosticAiOutput = {
  summary: "Likely an open ground given the low system voltage code and the reported no-start.",
  rankedCauses: [
    {
      cause: "Open ground at G103",
      confidenceLevel: "high",
      rationale: "P0562 present alongside a reported no-start.",
      supportingEvidence: ["P0562"],
      contradictingEvidence: [],
      confirmationTestsRequired: ["Ohm test ground strap"],
    },
  ],
  recommendedTests: [{ step: "Ohm test ground strap", purpose: "Confirm ground integrity", expectedResult: "<0.1 ohm" }],
  safetyWarnings: [],
  missingInformation: [],
};

function fakeProvider(): DiagnosticAIProvider {
  return {
    id: "fake-provider",
    async runDiagnosis() {
      throw new Error("not used in these tests");
    },
    async runDiagnosticEngineTurn(): Promise<DiagnosticAIProviderResult> {
      return {
        providerId: "fake-provider",
        modelId: "fake-model",
        promptVersion: "test-v1",
        output: VALID_OUTPUT,
        tokens: { input: 500, output: 300 },
      };
    },
  };
}

function providerWithoutEngineTurn(): DiagnosticAIProvider {
  return {
    id: "fake-provider-no-engine",
    async runDiagnosis() {
      throw new Error("not used in these tests");
    },
  };
}

function failingProvider(err: Error): DiagnosticAIProvider {
  return {
    id: "fake-provider-failing",
    async runDiagnosis() {
      throw new Error("not used in these tests");
    },
    async runDiagnosticEngineTurn(): Promise<DiagnosticAIProviderResult> {
      throw err;
    },
  };
}

function seedCase(caseId: string, userId: string) {
  fake().seed("scan_cases", [
    {
      id: caseId,
      user_id: userId,
      status: "completed",
      complaint: "Won't start",
      symptoms: ["No crank"],
      mileage: 88000,
      recent_repairs: null,
      battery_condition: null,
      technician_notes: null,
    },
  ]);
  fake().seed("scan_extractions", [
    {
      id: "ext-1",
      case_id: caseId,
      vin: "1HGCM82633A004352",
      make: "Honda",
      model: "Accord",
      model_year: 2018,
      engine: "2.4L I4",
      odometer_miles: 88000,
      modules: [],
      freeze_frame: [],
      live_data: [],
      image_only_pdf: false,
      warnings: [],
      reviewed_fields: {},
    },
  ]);
  fake().seed("scan_dtc_records", [
    { id: "dtc-1", case_id: caseId, module: "PCM", code: "P0562", status: "current", description_raw: "System Voltage Low" },
  ]);
}

let usageIdCounter = 0;

beforeEach(() => {
  fake().reset();
  setFlags([]);
  usageIdCounter = 0;
  // Fakes migration 0032's record_diagnostic_engine_usage RPC closely
  // enough for these orchestration tests (dedicated unit tests of the
  // usage module itself live in test/diagnostic-engine-usage.test.ts).
  fake().setRpcHandler("record_diagnostic_engine_usage", (args) => {
    const userId = args.p_user_id as string;
    const requestId = args.p_request_id as string;
    const feature = args.p_feature as string;
    const dailyLimit = args.p_daily_limit as number | null;
    const monthlyLimit = args.p_monthly_limit as number | null;

    const rows = fake().dump("diagnostic_engine_usage");
    if (rows.some((r) => r.user_id === userId && r.request_id === requestId)) return "already_recorded";

    const matching = rows.filter((r) => r.user_id === userId && r.feature === feature);
    if (dailyLimit !== null && matching.length >= dailyLimit) return "daily_limit_exceeded";
    if (monthlyLimit !== null && matching.length >= monthlyLimit) return "monthly_limit_exceeded";

    usageIdCounter += 1;
    fake().seed("diagnostic_engine_usage", [
      {
        id: `usage-${usageIdCounter}`,
        user_id: userId,
        request_id: requestId,
        feature,
        plan: args.p_plan,
        access_level: args.p_access_level,
        created_at: new Date().toISOString(),
      },
    ]);
    return "recorded";
  });
});

const BUDGET_ENV_VARS = [
  "DIAGNOSTIC_ENGINE_DAILY_BUDGET_USD",
  "DIAGNOSTIC_ENGINE_MONTHLY_BUDGET_USD",
  "DIAGNOSTIC_ENGINE_USER_DAILY_BUDGET_USD",
  "DIAGNOSTIC_ENGINE_USER_MONTHLY_BUDGET_USD",
  "DIAGNOSTIC_ENGINE_INTERNAL_DAILY_BUDGET_USD",
  "DIAGNOSTIC_ENGINE_PROVIDER_KILL_SWITCH",
];
function resetBudgetEnv() {
  for (const name of BUDGET_ENV_VARS) delete process.env[name];
}

afterEach(() => {
  setFlags([]);
  resetBudgetEnv();
});

describe("runDiagnosticEngineTurn — feature flags default off", () => {
  it("with every flag off, only collects evidence and returns a null response/graph", async () => {
    seedCase("case-1", "user-1");
    const result = await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider(), defaultBilling());

    expect(result.response).toBeNull();
    expect(result.graph).toBeNull();
    expect(result.testPlan).toEqual([]);
    expect(result.safety).toBeNull();
    expect(result.evidenceCount).toBeGreaterThan(0);
    expect(fake().dump("diagnostic_probabilities")).toHaveLength(0);
  });

  it("throws ScanCaseNotFoundError for a case the user doesn't own, before touching any engine module", async () => {
    seedCase("case-1", "user-1");
    await expect(runDiagnosticEngineTurn("user-2", "case-1", fakeProvider(), defaultBilling())).rejects.toBeInstanceOf(ScanCaseNotFoundError);
  });
});

describe("runDiagnosticEngineTurn — evidence collection", () => {
  it("derives evidence from the case on the first turn, and does not duplicate it on a second turn", async () => {
    seedCase("case-1", "user-1");
    const first = await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider(), defaultBilling());
    const second = await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider(), defaultBilling());
    expect(second.evidenceCount).toBe(first.evidenceCount);
  });
});

describe("runDiagnosticEngineTurn — question engine", () => {
  it("selects and persists a next question only when QUESTION_ENGINE_ENABLED", async () => {
    seedCase("case-1", "user-1");
    await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider(), defaultBilling());
    expect(fake().dump("diagnostic_questions")).toHaveLength(0);

    setFlags(["QUESTION_ENGINE_ENABLED"]);
    await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider(), defaultBilling());
    expect(fake().dump("diagnostic_questions")).toHaveLength(1);
  });

  it("never asks the same fieldKey twice across turns", async () => {
    seedCase("case-1", "user-1");
    setFlags(["QUESTION_ENGINE_ENABLED"]);
    await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider(), defaultBilling());
    await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider(), defaultBilling());
    const questions = fake().dump("diagnostic_questions");
    expect(new Set(questions.map((q) => q.field_key)).size).toBe(questions.length);
  });
});

describe("runDiagnosticEngineTurn — probability engine", () => {
  it("calls the AI provider and persists ranked hypotheses only when PROBABILITY_ENGINE_ENABLED", async () => {
    seedCase("case-1", "user-1");
    setFlags(["PROBABILITY_ENGINE_ENABLED"]);
    const result = await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider(), defaultBilling());

    expect(result.response).not.toBeNull();
    expect(result.response?.probabilityRanking[0].hypothesis).toBe("Open ground at G103");
    expect(fake().dump("diagnostic_probabilities")).toHaveLength(1);
  });

  it("throws DiagnosticEngineProviderUnsupportedError when the provider has no runDiagnosticEngineTurn method", async () => {
    seedCase("case-1", "user-1");
    setFlags(["PROBABILITY_ENGINE_ENABLED"]);
    await expect(runDiagnosticEngineTurn("user-1", "case-1", providerWithoutEngineTurn(), defaultBilling())).rejects.toBeInstanceOf(
      DiagnosticEngineProviderUnsupportedError,
    );
  });
});

describe("runDiagnosticEngineTurn — provider failure handling", () => {
  it("propagates a provider failure without fabricating a response, and releases the reserved usage slot", async () => {
    seedCase("case-1", "user-1");
    setFlags(["PROBABILITY_ENGINE_ENABLED"]);
    const billing = defaultBilling();

    await expect(
      runDiagnosticEngineTurn("user-1", "case-1", failingProvider(new Error("simulated provider outage")), billing),
    ).rejects.toThrow("simulated provider outage");

    // The usage slot reserved before the call must be released on failure —
    // never silently left consumed for a request that produced nothing.
    expect(fake().dump("diagnostic_engine_usage").filter((r) => r.request_id === billing.requestId)).toHaveLength(0);
    // No hypotheses were fabricated from the failed call.
    expect(fake().dump("diagnostic_probabilities")).toHaveLength(0);
  });

  it("records a failed observability run with a classified failure category, not the raw error", async () => {
    seedCase("case-1", "user-1");
    setFlags(["PROBABILITY_ENGINE_ENABLED"]);

    const { AiResponseValidationError } = await import("@/lib/scan-diagnostics/api-errors");
    await expect(
      runDiagnosticEngineTurn(
        "user-1",
        "case-1",
        failingProvider(new AiResponseValidationError("model did not return a structured tool call")),
        defaultBilling(),
      ),
    ).rejects.toBeInstanceOf(AiResponseValidationError);

    const runs = fake().dump("diagnostic_engine_runs");
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("failed");
    expect(runs[0].failure_category).toBe("invalid_structured_response");
    expect(runs[0].schema_validation_result).toBe("invalid");
  });
});

describe("runDiagnosticEngineTurn — observability", () => {
  it("records a completed observability run with structured, non-text fields only", async () => {
    seedCase("case-1", "user-1");
    setFlags(["PROBABILITY_ENGINE_ENABLED", "CONFIDENCE_ENGINE_ENABLED"]);
    await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider(), defaultBilling());

    const runs = fake().dump("diagnostic_engine_runs");
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("completed");
    expect(runs[0].provider_called).toBe(true);
    expect(runs[0].hypothesis_count).toBe(1);
    expect(typeof runs[0].evidence_count).toBe("number");
    // No free-text case content ever appears among the recorded fields.
    const values = Object.values(runs[0]).map((v) => JSON.stringify(v));
    expect(values.join(" ")).not.toContain("Won't start");
  });

  it("records a skipped observability run with a skip reason when the AI call is avoided", async () => {
    seedCase("case-1", "user-1");
    setFlags(["DIAGNOSTIC_GRAPH_ENABLED", "PROBABILITY_ENGINE_ENABLED"]);
    await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider(), defaultBilling());
    await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider(), defaultBilling());

    const runs = fake().dump("diagnostic_engine_runs");
    const skipped = runs.find((r) => r.status === "skipped");
    expect(skipped).toBeDefined();
    expect(skipped?.skip_reason).toBe("evidence_unchanged_since_graph");
  });
});

describe("runDiagnosticEngineTurn — cost optimization", () => {
  it("skips a redundant AI call on a second turn with unchanged evidence, once the graph is enabled", async () => {
    seedCase("case-1", "user-1");
    setFlags(["DIAGNOSTIC_GRAPH_ENABLED", "PROBABILITY_ENGINE_ENABLED"]);

    const first = await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider(), defaultBilling());
    expect(first.costOptimization.aiCallSkipped).toBe(false);
    expect(first.hypotheses).toHaveLength(1);

    const second = await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider(), defaultBilling());
    expect(second.costOptimization.aiCallSkipped).toBe(true);
    expect(second.response).toBeNull();
    // Case memory survives even on a skipped turn — the existing snapshot
    // is still returned, not dropped.
    expect(second.hypotheses).toHaveLength(1);
    expect(second.hypotheses[0].hypothesis).toBe(first.hypotheses[0].hypothesis);
  });

  it("does not skip when new evidence exists since the last graph save", async () => {
    seedCase("case-1", "user-1");
    setFlags(["DIAGNOSTIC_GRAPH_ENABLED", "PROBABILITY_ENGINE_ENABLED", "QUESTION_ENGINE_ENABLED"]);
    await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider(), defaultBilling());

    const { insertEvidence, evidenceFromAnswer } = await import("@/lib/diagnostic-engine/evidence");
    await insertEvidence("case-1", [evidenceFromAnswer("crank_status", "Yes", "yes")]);

    const second = await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider(), defaultBilling());
    expect(second.costOptimization.aiCallSkipped).toBe(false);
  });
});

describe("runDiagnosticEngineTurn — diagnostic graph", () => {
  it("builds and persists a graph only when DIAGNOSTIC_GRAPH_ENABLED, including hypothesis nodes when probability is also on", async () => {
    seedCase("case-1", "user-1");
    setFlags(["DIAGNOSTIC_GRAPH_ENABLED", "PROBABILITY_ENGINE_ENABLED"]);
    const result = await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider(), defaultBilling());

    expect(result.graph).not.toBeNull();
    expect(result.graph?.nodes.some((n) => n.kind === "evidence")).toBe(true);
    expect(result.graph?.nodes.some((n) => n.kind === "hypothesis")).toBe(true);
  });
});

describe("runDiagnosticEngineTurn — test planner and safety", () => {
  it("only builds a test plan when TEST_PLANNER_ENABLED and the AI actually ran", async () => {
    seedCase("case-1", "user-1");
    setFlags(["PROBABILITY_ENGINE_ENABLED"]);
    const withoutPlanner = await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider(), defaultBilling());
    expect(withoutPlanner.testPlan).toEqual([]);

    setFlags(["PROBABILITY_ENGINE_ENABLED", "TEST_PLANNER_ENABLED"]);
    const withPlanner = await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider(), defaultBilling());
    expect(withPlanner.testPlan.length).toBeGreaterThan(0);
  });

  it("classifies drive safety whenever the AI ran, regardless of other flags", async () => {
    seedCase("case-1", "user-1");
    setFlags(["PROBABILITY_ENGINE_ENABLED"]);
    const result = await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider(), defaultBilling());
    expect(result.safety).not.toBeNull();
  });
});

describe("runDiagnosticEngineTurn — Phase 2.2 kill switch and budget guardrails", () => {
  it("the kill switch blocks the provider call entirely and never consumes a usage slot", async () => {
    seedCase("case-1", "user-1");
    setFlags(["PROBABILITY_ENGINE_ENABLED"]);
    process.env.DIAGNOSTIC_ENGINE_PROVIDER_KILL_SWITCH = "true";

    const billing = defaultBilling();
    await expect(runDiagnosticEngineTurn("user-1", "case-1", fakeProvider(), billing)).rejects.toThrow(
      /temporarily unavailable/,
    );

    expect(fake().dump("diagnostic_engine_usage").filter((r) => r.request_id === billing.requestId)).toHaveLength(0);
    expect(fake().dump("diagnostic_probabilities")).toHaveLength(0);
    const runs = fake().dump("diagnostic_engine_runs");
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("failed");
    expect(runs[0].failure_category).toBe("kill_switch_active");
    expect(runs[0].provider_called).toBe(false);
  });

  it("a global daily budget hard stop blocks the call and records which scope blocked it", async () => {
    seedCase("case-1", "user-1");
    setFlags(["PROBABILITY_ENGINE_ENABLED"]);
    process.env.DIAGNOSTIC_ENGINE_DAILY_BUDGET_USD = "1";
    fake().seed("diagnostic_engine_runs", [
      {
        user_id: "someone-else",
        case_id: "case-other",
        request_id: "prior-req",
        plan: "free",
        rollout_tier: "all_paid_users",
        is_internal: false,
        provider_called: true,
        estimated_cost_usd: 5,
        status: "completed",
        schema_validation_result: "valid",
        evidence_count: 1,
        hypothesis_count: 1,
        created_at: new Date().toISOString(),
      },
    ]);

    const billing = defaultBilling();
    await expect(runDiagnosticEngineTurn("user-1", "case-1", fakeProvider(), billing)).rejects.toThrow(
      /temporarily unavailable/,
    );

    const runs = fake().dump("diagnostic_engine_runs").filter((r) => r.user_id === "user-1");
    expect(runs).toHaveLength(1);
    expect(runs[0].failure_category).toBe("budget_exceeded");
    expect(runs[0].blocked_budget_scope).toBe("global_daily");
    // Never consumed a turn-count slot for a request blocked before reservation.
    expect(fake().dump("diagnostic_engine_usage").filter((r) => r.request_id === billing.requestId)).toHaveLength(0);
  });

  it("without any budget env vars configured, generation proceeds normally regardless of recorded spend", async () => {
    seedCase("case-1", "user-1");
    setFlags(["PROBABILITY_ENGINE_ENABLED"]);
    fake().seed("diagnostic_engine_runs", [
      {
        user_id: "user-1",
        case_id: "case-1",
        request_id: "prior-req",
        plan: "workshop",
        rollout_tier: "all_paid_users",
        is_internal: false,
        provider_called: true,
        estimated_cost_usd: 999,
        status: "completed",
        schema_validation_result: "valid",
        evidence_count: 1,
        hypothesis_count: 1,
        created_at: new Date().toISOString(),
      },
    ]);

    const result = await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider(), defaultBilling());
    expect(result.response).not.toBeNull();
  });
});
