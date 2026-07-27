import { describe, expect, it } from "vitest";
import { evidenceIdsRepresentedInGraph, evidenceUnchangedSinceGraph, shouldSkipRedundantAiCall } from "@/lib/diagnostic-engine/cost-optimization";
import type { EvidenceItem, DiagnosticGraph } from "@/lib/diagnostic-engine/types";

function evidenceItem(id: string): EvidenceItem {
  return { id, caseId: "case-1", type: "symptom", value: "x", source: "user_reported", confidence: "medium", recordedAt: "now" };
}

function graphWithEvidenceIds(ids: string[]): DiagnosticGraph {
  return {
    caseId: "case-1",
    nodes: ids.map((id) => ({ id: `evidence:${id}`, kind: "evidence" as const, label: id, data: { evidenceId: id } })),
    edges: [],
    version: 1,
    updatedAt: "now",
  };
}

describe("evidenceIdsRepresentedInGraph", () => {
  it("returns an empty set for a null graph", () => {
    expect(evidenceIdsRepresentedInGraph(null)).toEqual(new Set());
  });

  it("extracts only evidence-kind node ids, ignoring hypothesis/test/question nodes", () => {
    const graph: DiagnosticGraph = {
      caseId: "case-1",
      nodes: [
        { id: "evidence:e1", kind: "evidence", label: "x", data: { evidenceId: "e1" } },
        { id: "hypothesis:1", kind: "hypothesis", label: "y" },
      ],
      edges: [],
      version: 1,
      updatedAt: "now",
    };
    expect(evidenceIdsRepresentedInGraph(graph)).toEqual(new Set(["e1"]));
  });
});

describe("evidenceUnchangedSinceGraph", () => {
  it("is false when there is no graph yet", () => {
    expect(evidenceUnchangedSinceGraph([evidenceItem("e1")], null)).toBe(false);
  });

  it("is true when the evidence set exactly matches the graph's evidence nodes", () => {
    const evidence = [evidenceItem("e1"), evidenceItem("e2")];
    expect(evidenceUnchangedSinceGraph(evidence, graphWithEvidenceIds(["e1", "e2"]))).toBe(true);
  });

  it("is false when new evidence exists beyond what the graph represents", () => {
    const evidence = [evidenceItem("e1"), evidenceItem("e2"), evidenceItem("e3")];
    expect(evidenceUnchangedSinceGraph(evidence, graphWithEvidenceIds(["e1", "e2"]))).toBe(false);
  });

  it("is false when evidence was removed relative to what the graph represents", () => {
    const evidence = [evidenceItem("e1")];
    expect(evidenceUnchangedSinceGraph(evidence, graphWithEvidenceIds(["e1", "e2"]))).toBe(false);
  });
});

describe("shouldSkipRedundantAiCall", () => {
  it("never skips when there are no existing hypotheses yet, even if evidence matches the graph", () => {
    const evidence = [evidenceItem("e1")];
    const result = shouldSkipRedundantAiCall({ evidence, graph: graphWithEvidenceIds(["e1"]), hasExistingHypotheses: false });
    expect(result).toBe(false);
  });

  it("skips when hypotheses already exist and evidence is unchanged since the graph", () => {
    const evidence = [evidenceItem("e1")];
    const result = shouldSkipRedundantAiCall({ evidence, graph: graphWithEvidenceIds(["e1"]), hasExistingHypotheses: true });
    expect(result).toBe(true);
  });

  it("never skips when evidence changed, even with existing hypotheses", () => {
    const evidence = [evidenceItem("e1"), evidenceItem("e2")];
    const result = shouldSkipRedundantAiCall({ evidence, graph: graphWithEvidenceIds(["e1"]), hasExistingHypotheses: true });
    expect(result).toBe(false);
  });
});
