import { describe, expect, it } from "vitest";
import { computeEvidenceStrength, computeEngineConfidence } from "@/lib/diagnostic-engine/confidence";
import type { EvidenceItem, RankedHypothesis } from "@/lib/diagnostic-engine/types";

function evidenceItem(type: EvidenceItem["type"]): EvidenceItem {
  return { id: `e-${type}`, caseId: "case-1", type, value: "x", source: "extraction", confidence: "high", recordedAt: "now" };
}

describe("computeEvidenceStrength", () => {
  it("is fully deterministic set-membership, no partial credit for related evidence", () => {
    const { present, missing } = computeEvidenceStrength([evidenceItem("dtc_stored"), evidenceItem("symptom")]);
    expect(present).toEqual(["DTC", "Symptoms"]);
    expect(missing).toEqual(["Freeze Frame", "Live Data", "Repair History", "Vehicle Identification"]);
  });

  it("reports every checklist item missing for a case with no evidence at all", () => {
    const { present, missing } = computeEvidenceStrength([]);
    expect(present).toEqual([]);
    expect(missing).toHaveLength(6);
  });
});

describe("computeEngineConfidence", () => {
  const hypotheses: RankedHypothesis[] = [
    { rank: 1, hypothesis: "A", confidenceLevel: "high", reasoning: "r", evidenceStrength: "strong", supportingEvidenceIds: [], missingEvidence: [], requiredTests: ["Ohm test", "Voltage drop test"] },
    { rank: 2, hypothesis: "B", confidenceLevel: "medium", reasoning: "r", evidenceStrength: "moderate", supportingEvidenceIds: [], missingEvidence: [], requiredTests: ["Ohm test"] },
  ];

  it("takes overall confidence from the top-ranked hypothesis only", () => {
    const result = computeEngineConfidence(hypotheses, []);
    expect(result.overallConfidenceLevel).toBe("high");
  });

  it("falls back to insufficient_evidence when there are no hypotheses yet", () => {
    expect(computeEngineConfidence([], []).overallConfidenceLevel).toBe("insufficient_evidence");
  });

  it("dedupes required tests across all hypotheses", () => {
    const result = computeEngineConfidence(hypotheses, []);
    expect(result.requiredTests).toEqual(["Ohm test", "Voltage drop test"]);
  });

  it("carries through the deterministic evidence present/missing checklist", () => {
    const result = computeEngineConfidence(hypotheses, [evidenceItem("dtc_stored")]);
    expect(result.evidencePresent).toEqual(["DTC"]);
    expect(result.evidenceMissing).toContain("Live Data");
  });
});
