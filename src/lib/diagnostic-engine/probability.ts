// Probability Engine (docs/PROBABILITY_ENGINE.md).
//
// IMPORTANT DEVIATION FROM THE LITERAL PHASE 2 BRIEF: the brief's examples
// show raw numerical percentages ("87% Open Ground G103"). This app has an
// established, deliberate, documented policy against exactly that —
// docs/DIAGNOSTIC_SAFETY_RULES.md and every provider's safety suffix
// (shared-prompt.ts) explicitly forbid presenting a fabricated numerical
// confidence as a calibrated real-world probability. This module instead
// ranks hypotheses in order with a categorical confidenceLevel
// (high/medium/low/insufficient_evidence — the SAME enum already used
// throughout scan-diagnostics) plus explicit reasoning per rank, which
// satisfies "never produce only one answer, generate ranked hypotheses"
// without implying false precision. See the PROBABILITY_ENGINE_ENABLED
// flag and this file's own docs for how to reverse this decision later if
// genuinely wanted.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DiagnosticAiOutput, ConfidenceLevel } from "@/lib/scan-diagnostics/schemas";
import type { EvidenceItem } from "@/lib/diagnostic-engine/types";
import type { RankedHypothesis, EvidenceStrength } from "@/lib/diagnostic-engine/types";

const LEVEL_ORDER: Record<ConfidenceLevel, number> = { high: 3, medium: 2, low: 1, insufficient_evidence: 0 };

// Best-effort structured link from the AI's free-text supportingEvidence
// strings back to this case's own EvidenceItem ids — matches when the
// evidence's own value (a DTC code, a VIN, a vehicle field) appears
// verbatim in the AI's text. This is intentionally conservative (exact
// substring match only) rather than a fuzzy/semantic match, so it never
// falsely claims a piece of evidence "supports" a cause it doesn't
// actually mention.
function matchEvidenceIds(texts: string[], evidence: EvidenceItem[]): string[] {
  const joined = texts.join(" \n ").toLowerCase();
  const matched: string[] = [];
  for (const item of evidence) {
    const needle =
      typeof item.value === "string"
        ? item.value
        : item.value && typeof item.value === "object" && "code" in (item.value as Record<string, unknown>)
          ? (item.value as { code: string }).code
          : null;
    if (needle && joined.includes(needle.toLowerCase())) {
      matched.push(item.id);
    }
  }
  return matched;
}

function deriveEvidenceStrength(supportingCount: number, contradictingCount: number): EvidenceStrength {
  if (contradictingCount > 0 && contradictingCount >= supportingCount) return "weak";
  if (supportingCount >= 2) return "strong";
  if (supportingCount === 1) return "moderate";
  return "weak";
}

// Builds the ranked-hypothesis table from a primary AI assessment's
// rankedCauses — the AI already ranks causes (see
// AnthropicDiagnosticProvider/OpenAiDiagnosticProvider, both providers
// return the same DiagnosticAiOutput shape via the existing
// DiagnosticAIProvider abstraction), this function reframes that into the
// Phase 2 hypothesis-table shape and adds the deterministic
// evidence-strength/missing-evidence/required-tests fields the brief's
// Confidence Engine calls for — it does not re-rank or second-guess the
// AI's own ordering.
export function buildRankedHypotheses(output: DiagnosticAiOutput, evidence: EvidenceItem[]): RankedHypothesis[] {
  return output.rankedCauses
    .map((cause, index) => {
      const supportingEvidenceIds = matchEvidenceIds(cause.supportingEvidence, evidence);
      return {
        rank: index + 1,
        hypothesis: cause.cause,
        confidenceLevel: cause.confidenceLevel,
        reasoning: cause.rationale,
        evidenceStrength: deriveEvidenceStrength(
          Math.max(supportingEvidenceIds.length, cause.supportingEvidence.length),
          cause.contradictingEvidence.length,
        ),
        supportingEvidenceIds,
        // Missing-evidence is a CASE-level concept in this app (see
        // src/lib/diagnostic-engine/confidence.ts computeEvidenceStrength) —
        // there is no reliable deterministic way to attribute "which
        // specific evidence gap applies to THIS hypothesis" without NLP
        // this app doesn't have, so it is intentionally left empty here
        // rather than guessed.
        missingEvidence: [],
        requiredTests: cause.confirmationTestsRequired,
      };
    })
    .sort((a, b) => LEVEL_ORDER[b.confidenceLevel] - LEVEL_ORDER[a.confidenceLevel] || a.rank - b.rank)
    .map((h, i) => ({ ...h, rank: i + 1 }));
}

interface ProbabilityRow {
  case_id: string;
  rank: number;
  hypothesis: string;
  confidence_level: ConfidenceLevel;
  reasoning: string;
  evidence_strength: EvidenceStrength;
  supporting_evidence_ids: string[];
  missing_evidence: string[];
  required_tests: string[];
}

function fromRow(row: ProbabilityRow): RankedHypothesis {
  return {
    rank: row.rank,
    hypothesis: row.hypothesis,
    confidenceLevel: row.confidence_level,
    reasoning: row.reasoning,
    evidenceStrength: row.evidence_strength,
    supportingEvidenceIds: row.supporting_evidence_ids,
    missingEvidence: row.missing_evidence,
    requiredTests: row.required_tests,
  };
}

export async function getHypothesesForCase(caseId: string): Promise<RankedHypothesis[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("diagnostic_probabilities")
    .select("*")
    .eq("case_id", caseId)
    .order("rank", { ascending: true });
  if (error) throw error;
  return (data as ProbabilityRow[]).map(fromRow);
}

// Delete-then-insert, matching the existing scan_patterns convention
// (migration 0028/analyze.ts) — this table holds the CURRENT ranked
// hypothesis snapshot for a case, never an accumulating history of every
// past ranking.
export async function saveHypotheses(caseId: string, hypotheses: RankedHypothesis[]): Promise<RankedHypothesis[]> {
  const supabase = createAdminClient();
  const { error: deleteError } = await supabase.from("diagnostic_probabilities").delete().eq("case_id", caseId);
  if (deleteError) throw deleteError;
  if (hypotheses.length === 0) return [];

  const { data, error } = await supabase
    .from("diagnostic_probabilities")
    .insert(
      hypotheses.map((h) => ({
        case_id: caseId,
        rank: h.rank,
        hypothesis: h.hypothesis,
        confidence_level: h.confidenceLevel,
        reasoning: h.reasoning,
        evidence_strength: h.evidenceStrength,
        supporting_evidence_ids: h.supportingEvidenceIds,
        missing_evidence: h.missingEvidence,
        required_tests: h.requiredTests,
      })),
    )
    .select("*");
  if (error) throw error;
  return (data as ProbabilityRow[]).map(fromRow).sort((a, b) => a.rank - b.rank);
}
