// Prompt Builder (docs/PHASE_2_ARCHITECTURE.md#prompt-builder) — "The LLM
// should NEVER receive raw prompts directly from the frontend." Every fact
// that reaches a provider passes through this module first, assembled into
// labeled sections (Vehicle, Evidence, Symptoms, Known Facts, Unknown
// Facts, Diagnostic Graph, Probability Table, Safety, Question To Answer)
// and only then rendered to a string — never raw frontend text
// concatenated directly into a prompt. Mirrors the section-by-section,
// labeled-lines style already established in
// src/lib/scan-diagnostics/ai/shared-prompt.ts's buildUserPrompt, so a
// human reviewing either prompt recognizes the same conventions.
//
// This module is provider-agnostic on purpose: it produces a structured
// DiagnosticEnginePromptSections object plus a rendered string, and stops
// there. Handing that content to a specific DiagnosticAIProvider (Anthropic
// today, OpenAI/others later via src/lib/scan-diagnostics/ai/registry.ts)
// is the case-memory API's job (Slice H) — the Prompt Builder itself never
// imports or calls a provider, which is what keeps "the AI provider must
// be interchangeable" true.
import type { EvidenceItem, EvidenceType } from "@/lib/diagnostic-engine/types";
import type { DiagnosticGraph } from "@/lib/diagnostic-engine/types";
import type { RankedHypothesis } from "@/lib/diagnostic-engine/types";
import type { CandidateQuestion } from "@/lib/diagnostic-engine/question";
import { computeEvidenceStrength } from "@/lib/diagnostic-engine/confidence";

export interface DiagnosticEnginePromptSections {
  vehicle: string;
  evidence: string;
  symptoms: string;
  knownFacts: string;
  unknownFacts: string;
  diagnosticGraph: string;
  probabilityTable: string;
  safety: string;
  questionToAnswer: string;
}

function evidenceValueText(item: EvidenceItem): string {
  if (typeof item.value === "string") return item.value;
  if (typeof item.value === "number") return String(item.value);
  if (item.value && typeof item.value === "object" && "code" in (item.value as Record<string, unknown>)) {
    const v = item.value as { code: string; description?: string; reason?: string };
    const extra = v.description ?? v.reason;
    return extra ? `${v.code} (${extra})` : v.code;
  }
  return JSON.stringify(item.value);
}

function describeEvidence(items: EvidenceItem[], label: string): string {
  const matches = items.filter((i) => i.type === label);
  if (matches.length === 0) return "not provided";
  return matches.map((i) => `${evidenceValueText(i)} [confidence: ${i.confidence}, source: ${i.source}]`).join("; ");
}

const VEHICLE_TYPES: EvidenceType[] = ["vin", "vehicle", "engine", "transmission", "mileage"];
const SYMPTOM_TYPES: EvidenceType[] = ["complaint", "symptom"];

// Builds the Vehicle section from whichever vehicle-identity evidence
// exists — never assumes a fixed vehicle shape the way CanonicalDiagnosticInput
// does, since evidence for this section can arrive incrementally through
// the Question Engine, not only from an initial scan/intake.
function buildVehicleSection(evidence: EvidenceItem[]): string {
  const lines = VEHICLE_TYPES.map((type) => `${type}: ${describeEvidence(evidence, type)}`);
  return lines.join("\n");
}

function buildEvidenceSection(evidence: EvidenceItem[]): string {
  if (evidence.length === 0) return "No evidence recorded yet for this case.";
  return evidence
    .map((item) => `- [${item.type}] ${evidenceValueText(item)} (confidence: ${item.confidence}, source: ${item.source})`)
    .join("\n");
}

function buildSymptomsSection(evidence: EvidenceItem[]): string {
  const symptoms = evidence.filter((i) => SYMPTOM_TYPES.includes(i.type));
  if (symptoms.length === 0) return "No complaint or symptoms recorded yet.";
  return symptoms.map((i) => `- ${evidenceValueText(i)}`).join("\n");
}

// "Known Facts" / "Unknown Facts" is the same present/missing split
// confidence.ts already computes deterministically for the Confidence
// Engine — reused here rather than re-deriving it a second way, so the
// prompt and the confidence output can never disagree about what's known.
function buildKnownUnknownSections(evidence: EvidenceItem[]): { known: string; unknown: string } {
  const { present, missing } = computeEvidenceStrength(evidence);
  return {
    known: present.length ? present.join(", ") : "none confirmed yet",
    unknown: missing.length ? missing.join(", ") : "none — all checklist categories have at least some evidence",
  };
}

function buildDiagnosticGraphSection(graph: DiagnosticGraph | null): string {
  if (!graph || graph.nodes.length === 0) return "No diagnostic graph yet — this is the first pass over this case.";
  const nodeLines = graph.nodes.map((n) => `- (${n.kind}) ${n.label}${n.status ? ` [${n.status}]` : ""}`);
  const edgeLines = graph.edges.map((e) => `- ${e.from} --${e.relation}--> ${e.to}`);
  return [`Nodes (version ${graph.version}):`, ...nodeLines, "Edges:", ...edgeLines].join("\n");
}

function buildProbabilityTableSection(hypotheses: RankedHypothesis[]): string {
  if (hypotheses.length === 0) return "No ranked hypotheses yet — this is the first assessment for this case.";
  return hypotheses
    .map(
      (h) =>
        `${h.rank}. ${h.hypothesis} — confidence: ${h.confidenceLevel}, evidence strength: ${h.evidenceStrength}. Reasoning: ${h.reasoning}`,
    )
    .join("\n");
}

// Phase 2.2 (docs/PHASE_2_2_EV_SAFETY_AUDIT.md) — also surfaces
// hv_safety_hazard evidence, labeled distinctly from a generic
// safety_issue, so the AI sees the SAME deterministic hazard the Safety
// Engine has already independently classified — never a hidden
// disagreement between what the model is told and what the deterministic
// rule (safety.ts) will enforce regardless of what the model says.
function buildSafetySection(evidence: EvidenceItem[]): string {
  const safetyItems = evidence.filter((i) => i.type === "safety_issue");
  const hvHazardItems = evidence.filter((i) => i.type === "hv_safety_hazard");
  if (safetyItems.length === 0 && hvHazardItems.length === 0) return "No safety-relevant evidence flagged so far.";

  const lines: string[] = [];
  for (const item of hvHazardItems) {
    lines.push(`- [HIGH-VOLTAGE HAZARD — deterministically classified immediate_stop, cannot be overridden] ${evidenceValueText(item)}`);
  }
  for (const item of safetyItems) {
    lines.push(`- ${evidenceValueText(item)}`);
  }
  return lines.join("\n");
}

function buildQuestionToAnswerSection(nextQuestion: CandidateQuestion | null): string {
  if (!nextQuestion) return "No outstanding question — evaluate whether confidence is sufficient to conclude.";
  return `${nextQuestion.questionText} (expects a ${nextQuestion.responseType} answer${nextQuestion.choices?.length ? `: ${nextQuestion.choices.join(" / ")}` : ""})`;
}

export interface BuildDiagnosticPromptParams {
  evidence: EvidenceItem[];
  graph: DiagnosticGraph | null;
  hypotheses: RankedHypothesis[];
  nextQuestion: CandidateQuestion | null;
}

export function buildDiagnosticPromptSections(params: BuildDiagnosticPromptParams): DiagnosticEnginePromptSections {
  const { known, unknown } = buildKnownUnknownSections(params.evidence);
  return {
    vehicle: buildVehicleSection(params.evidence),
    evidence: buildEvidenceSection(params.evidence),
    symptoms: buildSymptomsSection(params.evidence),
    knownFacts: known,
    unknownFacts: unknown,
    diagnosticGraph: buildDiagnosticGraphSection(params.graph),
    probabilityTable: buildProbabilityTableSection(params.hypotheses),
    safety: buildSafetySection(params.evidence),
    questionToAnswer: buildQuestionToAnswerSection(params.nextQuestion),
  };
}

const SECTION_ORDER: Array<[keyof DiagnosticEnginePromptSections, string]> = [
  ["vehicle", "VEHICLE"],
  ["evidence", "EVIDENCE"],
  ["symptoms", "SYMPTOMS"],
  ["knownFacts", "KNOWN FACTS"],
  ["unknownFacts", "UNKNOWN FACTS"],
  ["diagnosticGraph", "DIAGNOSTIC GRAPH"],
  ["probabilityTable", "PROBABILITY TABLE"],
  ["safety", "SAFETY"],
  ["questionToAnswer", "QUESTION TO ANSWER"],
];

// Deterministic, labeled rendering — the only place section text is ever
// concatenated into a single string, and only after every section has
// already been assembled from structured data above.
export function renderDiagnosticPrompt(sections: DiagnosticEnginePromptSections): string {
  return SECTION_ORDER.map(([key, heading]) => `${heading}\n${sections[key]}`).join("\n\n");
}
