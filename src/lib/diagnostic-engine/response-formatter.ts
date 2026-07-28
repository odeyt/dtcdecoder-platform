// Response Formatter (docs/PHASE_2_ARCHITECTURE.md#response-formatter) —
// "LLM response must become structured: Summary, Evidence Used,
// Probability Ranking, Recommended Tests, Safety, Next Question,
// Confidence. Never return large unstructured paragraphs." This module is
// the seam where every other engine module's output (probability.ts,
// confidence.ts, question.ts) is assembled into the one object the API
// (Slice H) and UI actually consume — the AI's own free-text `summary` is
// the only prose field, everything else is structured data.
//
// `safety` and `recommendedTests` are populated from the primary AI
// assessment's own safetyWarnings/recommendedTests for now — the Safety
// Engine's categorical drive-safety classification and the Test Planner's
// cost/difficulty/risk ranking (spec sections 6/7) are Slice G, not yet
// built. When Slice G lands, it replaces the pass-through values below
// with its own richer output; this formatter's shape does not need to
// change to accommodate that.
import type { DiagnosticAiOutput } from "@/lib/scan-diagnostics/schemas";
import type { EvidenceItem, RankedHypothesis, DiagnosticQuestion } from "@/lib/diagnostic-engine/types";
import type { DiagnosticEngineConfidence } from "@/lib/diagnostic-engine/confidence";

export interface EvidenceUsedSummary {
  id: string;
  type: EvidenceItem["type"];
  summary: string;
}

export interface DiagnosticEngineResponse {
  summary: string;
  evidenceUsed: EvidenceUsedSummary[];
  probabilityRanking: RankedHypothesis[];
  recommendedTests: string[];
  safety: string[];
  // The PERSISTED question (has a real id an answer can reference), not
  // the raw CandidateQuestion the Question Engine selected from — a
  // client needs the id to call POST /answers. See orchestrator.ts, which
  // passes its `persistedQuestion` here, not the bare candidate.
  nextQuestion: DiagnosticQuestion | null;
  confidence: DiagnosticEngineConfidence;
}

function summarizeEvidenceValue(item: EvidenceItem): string {
  if (typeof item.value === "string") return item.value;
  if (typeof item.value === "number") return String(item.value);
  if (item.value && typeof item.value === "object" && "code" in (item.value as Record<string, unknown>)) {
    return (item.value as { code: string }).code;
  }
  return item.type;
}

// Only evidence actually referenced by at least one ranked hypothesis is
// surfaced as "Evidence Used" — this is deliberately narrower than "every
// piece of evidence on the case" (that's the Evidence Engine's own
// getEvidenceForCase), matching the spec's "Evidence Used" wording as
// evidence the reasoning actually drew on.
function buildEvidenceUsed(hypotheses: RankedHypothesis[], evidence: EvidenceItem[]): EvidenceUsedSummary[] {
  const usedIds = new Set(hypotheses.flatMap((h) => h.supportingEvidenceIds));
  return evidence
    .filter((item) => usedIds.has(item.id))
    .map((item) => ({ id: item.id, type: item.type, summary: summarizeEvidenceValue(item) }));
}

export interface FormatDiagnosticEngineResponseParams {
  output: DiagnosticAiOutput;
  evidence: EvidenceItem[];
  hypotheses: RankedHypothesis[];
  confidence: DiagnosticEngineConfidence;
  nextQuestion: DiagnosticQuestion | null;
}

export function formatDiagnosticEngineResponse(params: FormatDiagnosticEngineResponseParams): DiagnosticEngineResponse {
  return {
    summary: params.output.summary,
    evidenceUsed: buildEvidenceUsed(params.hypotheses, params.evidence),
    probabilityRanking: params.hypotheses,
    recommendedTests: params.output.recommendedTests.map((t) => t.step),
    safety: params.output.safetyWarnings,
    nextQuestion: params.nextQuestion,
    confidence: params.confidence,
  };
}
