import { describe, expect, it } from "vitest";
import { buildRankedHypotheses } from "@/lib/diagnostic-engine/probability";
import type { DiagnosticAiOutput } from "@/lib/scan-diagnostics/schemas";
import type { EvidenceItem } from "@/lib/diagnostic-engine/types";

function output(rankedCauses: DiagnosticAiOutput["rankedCauses"]): DiagnosticAiOutput {
  return {
    summary: "summary",
    rankedCauses,
    recommendedTests: [],
    safetyWarnings: [],
  } as unknown as DiagnosticAiOutput;
}

const evidence: EvidenceItem[] = [
  { id: "e1", caseId: "case-1", type: "dtc_stored", value: { code: "P0562" }, source: "extraction", confidence: "high", recordedAt: "now" },
  { id: "e2", caseId: "case-1", type: "vin", value: "1HGCM82633A004352", source: "extraction", confidence: "high", recordedAt: "now" },
];

describe("buildRankedHypotheses", () => {
  it("re-sorts by categorical confidence level, high first, re-numbering ranks", () => {
    const result = buildRankedHypotheses(
      output([
        { cause: "Crank sensor", confidenceLevel: "low", complaintCorrelation: "unknown", rationale: "r1", supportingEvidence: [], contradictingEvidence: [], confirmationTestsRequired: [] },
        { cause: "Open ground G103", confidenceLevel: "high", complaintCorrelation: "unknown", rationale: "r2", supportingEvidence: ["P0562 present"], contradictingEvidence: [], confirmationTestsRequired: ["Ohm test"] },
        { cause: "ECM internal failure", confidenceLevel: "medium", complaintCorrelation: "unknown", rationale: "r3", supportingEvidence: [], contradictingEvidence: [], confirmationTestsRequired: [] },
      ]),
      evidence,
    );

    expect(result.map((h) => h.hypothesis)).toEqual(["Open ground G103", "ECM internal failure", "Crank sensor"]);
    expect(result.map((h) => h.rank)).toEqual([1, 2, 3]);
  });

  it("links supportingEvidenceIds via conservative substring match on the evidence's own value", () => {
    const result = buildRankedHypotheses(
      output([
        { cause: "Low system voltage", confidenceLevel: "high", complaintCorrelation: "unknown", rationale: "r", supportingEvidence: ["Code P0562 was recorded"], contradictingEvidence: [], confirmationTestsRequired: [] },
      ]),
      evidence,
    );
    expect(result[0].supportingEvidenceIds).toEqual(["e1"]);
  });

  it("never matches evidence whose value is not actually mentioned in the AI's text", () => {
    const result = buildRankedHypotheses(
      output([
        { cause: "Unrelated cause", confidenceLevel: "low", complaintCorrelation: "unknown", rationale: "r", supportingEvidence: ["Nothing specific mentioned"], contradictingEvidence: [], confirmationTestsRequired: [] },
      ]),
      evidence,
    );
    expect(result[0].supportingEvidenceIds).toEqual([]);
  });

  it("derives evidence strength: contradicting >= supporting is weak, 2+ supporting is strong, exactly 1 is moderate", () => {
    const result = buildRankedHypotheses(
      output([
        { cause: "A", confidenceLevel: "low", complaintCorrelation: "unknown", rationale: "r", supportingEvidence: ["one"], contradictingEvidence: ["one", "two"], confirmationTestsRequired: [] },
        { cause: "B", confidenceLevel: "high", complaintCorrelation: "unknown", rationale: "r", supportingEvidence: ["P0562 present", "1HGCM82633A004352 confirmed"], contradictingEvidence: [], confirmationTestsRequired: [] },
        { cause: "C", confidenceLevel: "medium", complaintCorrelation: "unknown", rationale: "r", supportingEvidence: ["P0562 present"], contradictingEvidence: [], confirmationTestsRequired: [] },
      ]),
      evidence,
    );
    const byCause = Object.fromEntries(result.map((h) => [h.hypothesis, h.evidenceStrength]));
    expect(byCause.B).toBe("strong");
    expect(byCause.C).toBe("moderate");
    expect(byCause.A).toBe("weak");
  });

  it("always leaves per-hypothesis missingEvidence empty (a case-level concept, not attributed per-hypothesis)", () => {
    const result = buildRankedHypotheses(
      output([{ cause: "A", confidenceLevel: "high", complaintCorrelation: "unknown", rationale: "r", supportingEvidence: [], contradictingEvidence: [], confirmationTestsRequired: [] }]),
      evidence,
    );
    expect(result[0].missingEvidence).toEqual([]);
  });

  it("carries confirmationTestsRequired through as requiredTests", () => {
    const result = buildRankedHypotheses(
      output([{ cause: "A", confidenceLevel: "high", complaintCorrelation: "unknown", rationale: "r", supportingEvidence: [], contradictingEvidence: [], confirmationTestsRequired: ["Fuel pressure test"] }]),
      evidence,
    );
    expect(result[0].requiredTests).toEqual(["Fuel pressure test"]);
  });
});
