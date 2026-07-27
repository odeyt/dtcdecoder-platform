import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";

vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabase = fake;
  return { createAdminClient: () => fake };
});

const {
  getGraphForCase,
  saveGraph,
  buildEvidenceNodes,
  buildHypothesisNodesAndEdges,
  buildTestNodesAndEdges,
  buildQuestionNode,
  mergeGraph,
} = await import("@/lib/diagnostic-engine/graph");
import type { EvidenceItem, RankedHypothesis, PlannedTest, DiagnosticQuestion } from "@/lib/diagnostic-engine/types";

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

beforeEach(() => {
  fake().reset();
});

describe("getGraphForCase / saveGraph", () => {
  it("returns null for a case with no graph yet", async () => {
    expect(await getGraphForCase("case-1")).toBeNull();
  });

  it("saves a graph at version 1, then increments the version on each subsequent save", async () => {
    const first = await saveGraph("case-1", [], []);
    expect(first.version).toBe(1);

    const second = await saveGraph("case-1", [{ id: "n1", kind: "evidence", label: "x" }], []);
    expect(second.version).toBe(2);
    expect(second.nodes).toHaveLength(1);

    expect(fake().dump("diagnostic_graph")).toHaveLength(1);
  });
});

describe("buildEvidenceNodes", () => {
  it("builds one node per evidence item, id-prefixed and labeled", () => {
    const evidence: EvidenceItem[] = [
      { id: "e1", caseId: "case-1", type: "complaint", value: "Won't start", source: "user_reported", confidence: "high", recordedAt: "now" },
      { id: "e2", caseId: "case-1", type: "dtc_stored", value: { code: "P0301" }, source: "extraction", confidence: "high", recordedAt: "now" },
    ];
    const nodes = buildEvidenceNodes(evidence);
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ id: "evidence:e1", kind: "evidence", label: "complaint: Won't start", status: "high" });
    expect(nodes[1].label).toBe("dtc_stored: P0301");
  });
});

describe("buildHypothesisNodesAndEdges", () => {
  it("builds one node per hypothesis and a supports edge per supporting evidence id", () => {
    const hypotheses: RankedHypothesis[] = [
      {
        rank: 1,
        hypothesis: "Open ground",
        confidenceLevel: "high",
        reasoning: "Strong match",
        evidenceStrength: "strong",
        supportingEvidenceIds: ["e1", "e2"],
        missingEvidence: [],
        requiredTests: [],
      },
    ];
    const { nodes, edges } = buildHypothesisNodesAndEdges(hypotheses);
    expect(nodes).toEqual([
      { id: "hypothesis:1", kind: "hypothesis", label: "Open ground", status: "high", data: { rank: 1, evidenceStrength: "strong" } },
    ]);
    expect(edges).toEqual([
      { from: "evidence:e1", to: "hypothesis:1", relation: "supports" },
      { from: "evidence:e2", to: "hypothesis:1", relation: "supports" },
    ]);
  });
});

describe("buildTestNodesAndEdges", () => {
  it("links each test to its related hypothesis ranks", () => {
    const tests: PlannedTest[] = [
      { rank: 1, step: "Ohm test ground strap", purpose: "Confirm ground integrity", expectedResult: "<0.1 ohm", difficulty: "moderate", risk: "low", costLevel: "moderate", relatedHypothesisRanks: [1] },
    ];
    const { nodes, edges } = buildTestNodesAndEdges(tests);
    expect(nodes[0].id).toBe("test:1");
    expect(edges).toEqual([{ from: "test:1", to: "hypothesis:1", relation: "tests" }]);
  });
});

describe("buildQuestionNode", () => {
  it("reflects answered/pending status", () => {
    const question: DiagnosticQuestion = {
      id: "q1",
      caseId: "case-1",
      sequence: 1,
      fieldKey: "crank_status",
      questionText: "Does the engine crank?",
      responseType: "yes_no",
      choices: [],
      priorityScore: 80,
      askedAt: "now",
      answered: false,
    };
    expect(buildQuestionNode(question).status).toBe("pending");
    expect(buildQuestionNode({ ...question, answered: true }).status).toBe("answered");
  });
});

describe("mergeGraph", () => {
  it("replaces a node with the same id rather than duplicating it, and de-dupes edges by (from,to,relation)", () => {
    const existing = {
      nodes: [{ id: "question:q1", kind: "question" as const, label: "Does the engine crank?", status: "pending" }],
      edges: [{ from: "evidence:e1", to: "hypothesis:1", relation: "supports" }],
    };
    const additions = {
      nodes: [{ id: "question:q1", kind: "question" as const, label: "Does the engine crank?", status: "answered" }],
      edges: [{ from: "evidence:e1", to: "hypothesis:1", relation: "supports" }],
    };
    const merged = mergeGraph(existing, additions);
    expect(merged.nodes).toHaveLength(1);
    expect(merged.nodes[0].status).toBe("answered");
    expect(merged.edges).toHaveLength(1);
  });
});
