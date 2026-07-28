import { describe, expect, it } from "vitest";
import { formatDiagnosticEngineResponse } from "@/lib/diagnostic-engine/response-formatter";
import type { DiagnosticAiOutput } from "@/lib/scan-diagnostics/schemas";
import type { EvidenceItem, RankedHypothesis, DiagnosticQuestion } from "@/lib/diagnostic-engine/types";
import type { DiagnosticEngineConfidence } from "@/lib/diagnostic-engine/confidence";

const evidence: EvidenceItem[] = [
  { id: "e1", caseId: "case-1", type: "dtc_stored", value: { code: "P0562" }, source: "extraction", confidence: "high", recordedAt: "now" },
  { id: "e2", caseId: "case-1", type: "vin", value: "1HGCM82633A004352", source: "extraction", confidence: "high", recordedAt: "now" },
  { id: "e3", caseId: "case-1", type: "symptom", value: "Dies at idle", source: "user_reported", confidence: "medium", recordedAt: "now" },
];

const hypotheses: RankedHypothesis[] = [
  { rank: 1, hypothesis: "Open ground G103", confidenceLevel: "high", reasoning: "r", evidenceStrength: "strong", supportingEvidenceIds: ["e1", "e2"], missingEvidence: [], requiredTests: ["Ohm test"] },
];

const confidence: DiagnosticEngineConfidence = {
  overallConfidenceLevel: "high",
  evidencePresent: ["DTC"],
  evidenceMissing: ["Live Data"],
  requiredTests: ["Ohm test"],
};

const nextQuestion: DiagnosticQuestion = {
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

function aiOutput(overrides: Partial<DiagnosticAiOutput> = {}): DiagnosticAiOutput {
  return {
    summary: "Likely an open ground at G103 given the low system voltage code.",
    rankedCauses: [],
    recommendedTests: [{ step: "Ohm test ground strap", purpose: "Confirm ground integrity", expectedResult: "<0.1 ohm" }],
    safetyWarnings: ["Do not drive with intermittent stalling at speed."],
    missingInformation: [],
    ...overrides,
  } as DiagnosticAiOutput;
}

describe("formatDiagnosticEngineResponse", () => {
  it("assembles every spec-required field into one structured object", () => {
    const response = formatDiagnosticEngineResponse({ output: aiOutput(), evidence, hypotheses, confidence, nextQuestion });

    expect(response.summary).toBe(aiOutput().summary);
    expect(response.probabilityRanking).toBe(hypotheses);
    expect(response.recommendedTests).toEqual(["Ohm test ground strap"]);
    expect(response.safety).toEqual(["Do not drive with intermittent stalling at speed."]);
    expect(response.nextQuestion).toBe(nextQuestion);
    expect(response.confidence).toBe(confidence);
  });

  it("evidenceUsed only includes evidence actually referenced by a hypothesis's supportingEvidenceIds", () => {
    const response = formatDiagnosticEngineResponse({ output: aiOutput(), evidence, hypotheses, confidence, nextQuestion });
    expect(response.evidenceUsed.map((e) => e.id).sort()).toEqual(["e1", "e2"]);
    expect(response.evidenceUsed.find((e) => e.id === "e3")).toBeUndefined();
  });

  it("returns an empty evidenceUsed list when no hypothesis cites any evidence", () => {
    const response = formatDiagnosticEngineResponse({
      output: aiOutput(),
      evidence,
      hypotheses: [{ ...hypotheses[0], supportingEvidenceIds: [] }],
      confidence,
      nextQuestion,
    });
    expect(response.evidenceUsed).toEqual([]);
  });

  it("passes nextQuestion through as null when there is nothing left to ask", () => {
    const response = formatDiagnosticEngineResponse({ output: aiOutput(), evidence, hypotheses, confidence, nextQuestion: null });
    expect(response.nextQuestion).toBeNull();
  });
});
