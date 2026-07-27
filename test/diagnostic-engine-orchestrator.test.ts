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

beforeEach(() => {
  fake().reset();
  setFlags([]);
});

afterEach(() => {
  setFlags([]);
});

describe("runDiagnosticEngineTurn — feature flags default off", () => {
  it("with every flag off, only collects evidence and returns a null response/graph", async () => {
    seedCase("case-1", "user-1");
    const result = await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider());

    expect(result.response).toBeNull();
    expect(result.graph).toBeNull();
    expect(result.testPlan).toEqual([]);
    expect(result.safety).toBeNull();
    expect(result.evidenceCount).toBeGreaterThan(0);
    expect(fake().dump("diagnostic_probabilities")).toHaveLength(0);
  });

  it("throws ScanCaseNotFoundError for a case the user doesn't own, before touching any engine module", async () => {
    seedCase("case-1", "user-1");
    await expect(runDiagnosticEngineTurn("user-2", "case-1", fakeProvider())).rejects.toBeInstanceOf(ScanCaseNotFoundError);
  });
});

describe("runDiagnosticEngineTurn — evidence collection", () => {
  it("derives evidence from the case on the first turn, and does not duplicate it on a second turn", async () => {
    seedCase("case-1", "user-1");
    const first = await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider());
    const second = await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider());
    expect(second.evidenceCount).toBe(first.evidenceCount);
  });
});

describe("runDiagnosticEngineTurn — question engine", () => {
  it("selects and persists a next question only when QUESTION_ENGINE_ENABLED", async () => {
    seedCase("case-1", "user-1");
    await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider());
    expect(fake().dump("diagnostic_questions")).toHaveLength(0);

    setFlags(["QUESTION_ENGINE_ENABLED"]);
    await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider());
    expect(fake().dump("diagnostic_questions")).toHaveLength(1);
  });

  it("never asks the same fieldKey twice across turns", async () => {
    seedCase("case-1", "user-1");
    setFlags(["QUESTION_ENGINE_ENABLED"]);
    await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider());
    await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider());
    const questions = fake().dump("diagnostic_questions");
    expect(new Set(questions.map((q) => q.field_key)).size).toBe(questions.length);
  });
});

describe("runDiagnosticEngineTurn — probability engine", () => {
  it("calls the AI provider and persists ranked hypotheses only when PROBABILITY_ENGINE_ENABLED", async () => {
    seedCase("case-1", "user-1");
    setFlags(["PROBABILITY_ENGINE_ENABLED"]);
    const result = await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider());

    expect(result.response).not.toBeNull();
    expect(result.response?.probabilityRanking[0].hypothesis).toBe("Open ground at G103");
    expect(fake().dump("diagnostic_probabilities")).toHaveLength(1);
  });

  it("throws DiagnosticEngineProviderUnsupportedError when the provider has no runDiagnosticEngineTurn method", async () => {
    seedCase("case-1", "user-1");
    setFlags(["PROBABILITY_ENGINE_ENABLED"]);
    await expect(runDiagnosticEngineTurn("user-1", "case-1", providerWithoutEngineTurn())).rejects.toBeInstanceOf(
      DiagnosticEngineProviderUnsupportedError,
    );
  });
});

describe("runDiagnosticEngineTurn — cost optimization", () => {
  it("skips a redundant AI call on a second turn with unchanged evidence, once the graph is enabled", async () => {
    seedCase("case-1", "user-1");
    setFlags(["DIAGNOSTIC_GRAPH_ENABLED", "PROBABILITY_ENGINE_ENABLED"]);

    const first = await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider());
    expect(first.costOptimization.aiCallSkipped).toBe(false);
    expect(first.hypotheses).toHaveLength(1);

    const second = await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider());
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
    await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider());

    const { insertEvidence, evidenceFromAnswer } = await import("@/lib/diagnostic-engine/evidence");
    await insertEvidence("case-1", [evidenceFromAnswer("crank_status", "Yes", "yes")]);

    const second = await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider());
    expect(second.costOptimization.aiCallSkipped).toBe(false);
  });
});

describe("runDiagnosticEngineTurn — diagnostic graph", () => {
  it("builds and persists a graph only when DIAGNOSTIC_GRAPH_ENABLED, including hypothesis nodes when probability is also on", async () => {
    seedCase("case-1", "user-1");
    setFlags(["DIAGNOSTIC_GRAPH_ENABLED", "PROBABILITY_ENGINE_ENABLED"]);
    const result = await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider());

    expect(result.graph).not.toBeNull();
    expect(result.graph?.nodes.some((n) => n.kind === "evidence")).toBe(true);
    expect(result.graph?.nodes.some((n) => n.kind === "hypothesis")).toBe(true);
  });
});

describe("runDiagnosticEngineTurn — test planner and safety", () => {
  it("only builds a test plan when TEST_PLANNER_ENABLED and the AI actually ran", async () => {
    seedCase("case-1", "user-1");
    setFlags(["PROBABILITY_ENGINE_ENABLED"]);
    const withoutPlanner = await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider());
    expect(withoutPlanner.testPlan).toEqual([]);

    setFlags(["PROBABILITY_ENGINE_ENABLED", "TEST_PLANNER_ENABLED"]);
    const withPlanner = await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider());
    expect(withPlanner.testPlan.length).toBeGreaterThan(0);
  });

  it("classifies drive safety whenever the AI ran, regardless of other flags", async () => {
    seedCase("case-1", "user-1");
    setFlags(["PROBABILITY_ENGINE_ENABLED"]);
    const result = await runDiagnosticEngineTurn("user-1", "case-1", fakeProvider());
    expect(result.safety).not.toBeNull();
  });
});
