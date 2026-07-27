import { describe, expect, it } from "vitest";
import { buildDiagnosticPromptSections, renderDiagnosticPrompt } from "@/lib/diagnostic-engine/prompt-builder";
import type { EvidenceItem, DiagnosticGraph, RankedHypothesis } from "@/lib/diagnostic-engine/types";
import type { CandidateQuestion } from "@/lib/diagnostic-engine/question";

const evidence: EvidenceItem[] = [
  { id: "e1", caseId: "case-1", type: "vin", value: "1HGCM82633A004352", source: "extraction", confidence: "high", recordedAt: "now" },
  { id: "e2", caseId: "case-1", type: "complaint", value: "Won't start", source: "user_reported", confidence: "high", recordedAt: "now" },
  { id: "e3", caseId: "case-1", type: "dtc_stored", value: { code: "P0562", description: "System Voltage Low" }, source: "extraction", confidence: "high", recordedAt: "now" },
  { id: "e4", caseId: "case-1", type: "safety_issue", value: { code: "P0562", reason: "Flagged as a safety-relevant system fault." }, source: "derived", confidence: "medium", recordedAt: "now" },
  { id: "e5", caseId: "case-1", type: "symptom", value: "Rough idle at start", source: "user_reported", confidence: "medium", recordedAt: "now" },
];

describe("buildDiagnosticPromptSections", () => {
  it("builds every required spec section from evidence alone when there is no graph/hypotheses/question yet", () => {
    const sections = buildDiagnosticPromptSections({ evidence, graph: null, hypotheses: [], nextQuestion: null });

    expect(sections.vehicle).toContain("1HGCM82633A004352");
    expect(sections.symptoms).toContain("Won't start");
    expect(sections.evidence).toContain("P0562");
    expect(sections.diagnosticGraph).toMatch(/first pass/);
    expect(sections.probabilityTable).toMatch(/No ranked hypotheses/);
    expect(sections.safety).toContain("Flagged as a safety-relevant");
    expect(sections.questionToAnswer).toMatch(/sufficient to conclude/);
  });

  it("known/unknown facts reuse the same deterministic checklist as the Confidence Engine", () => {
    const sections = buildDiagnosticPromptSections({ evidence, graph: null, hypotheses: [], nextQuestion: null });
    expect(sections.knownFacts).toContain("DTC");
    expect(sections.knownFacts).toContain("Symptoms");
    expect(sections.unknownFacts).toContain("Freeze Frame");
  });

  it("summarizes an existing graph's nodes and edges", () => {
    const graph: DiagnosticGraph = {
      caseId: "case-1",
      nodes: [{ id: "evidence:e1", kind: "evidence", label: "vin: 1HGCM82633A004352" }],
      edges: [{ from: "evidence:e1", to: "hypothesis:1", relation: "supports" }],
      version: 3,
      updatedAt: "now",
    };
    const sections = buildDiagnosticPromptSections({ evidence, graph, hypotheses: [], nextQuestion: null });
    expect(sections.diagnosticGraph).toContain("version 3");
    expect(sections.diagnosticGraph).toContain("supports");
  });

  it("renders the probability table and question-to-answer sections from live data", () => {
    const hypotheses: RankedHypothesis[] = [
      { rank: 1, hypothesis: "Open ground G103", confidenceLevel: "high", reasoning: "Matches P0562", evidenceStrength: "strong", supportingEvidenceIds: ["e3"], missingEvidence: [], requiredTests: [] },
    ];
    const nextQuestion: CandidateQuestion = { fieldKey: "crank_status", questionText: "Does the engine crank?", responseType: "yes_no", priorityTier: 3 };
    const sections = buildDiagnosticPromptSections({ evidence, graph: null, hypotheses, nextQuestion });
    expect(sections.probabilityTable).toContain("Open ground G103");
    expect(sections.probabilityTable).toContain("high");
    expect(sections.questionToAnswer).toContain("Does the engine crank?");
    expect(sections.questionToAnswer).toContain("yes_no");
  });

  it("includes choice options in the question-to-answer section when present", () => {
    const nextQuestion: CandidateQuestion = {
      fieldKey: "dtc_status",
      questionText: "Are the stored codes current, or history/intermittent?",
      responseType: "choice",
      choices: ["current", "history", "intermittent", "unknown"],
      priorityTier: 2,
    };
    const sections = buildDiagnosticPromptSections({ evidence, graph: null, hypotheses: [], nextQuestion });
    expect(sections.questionToAnswer).toContain("current / history / intermittent / unknown");
  });
});

describe("renderDiagnosticPrompt", () => {
  it("renders every section under its own labeled heading, in the spec's section order", () => {
    const sections = buildDiagnosticPromptSections({ evidence, graph: null, hypotheses: [], nextQuestion: null });
    const rendered = renderDiagnosticPrompt(sections);

    const headings = ["VEHICLE", "EVIDENCE", "SYMPTOMS", "KNOWN FACTS", "UNKNOWN FACTS", "DIAGNOSTIC GRAPH", "PROBABILITY TABLE", "SAFETY", "QUESTION TO ANSWER"];
    let lastIndex = -1;
    for (const heading of headings) {
      const index = rendered.indexOf(heading);
      expect(index).toBeGreaterThan(lastIndex);
      lastIndex = index;
    }
  });
});
