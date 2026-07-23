// Deterministic, documented confidence scoring — deliberately NOT a number
// the AI model itself picks. Combines model agreement (inert today since
// there's only one provider, but written to extend), evidence
// completeness, and the safety-review outcome into one headline number,
// while keeping every contributing factor visible in `rationale` so the
// report can explain *why* the score is what it is rather than just
// showing a bare percentage.
import type { CanonicalDiagnosticInput } from "@/lib/scan-diagnostics/schemas";
import type { DiagnosticAIProviderResult } from "@/lib/scan-diagnostics/ai/provider";
import type { SafetyReviewResult } from "@/lib/scan-diagnostics/safety-rules";

const MIN_CONFIDENCE = 10;
const MAX_CONFIDENCE = 95;
const MAX_MISSING_INFO_DEDUCTION = 20;
const PER_MISSING_INFO_DEDUCTION = 5;

export interface ConfidenceResult {
  confidence: number;
  rationale: string[];
}

// Single-provider baseline today. When a second/third provider is added,
// providers agreeing on the same top-ranked cause raises the base (strong
// independent agreement); disagreement lowers it — this branch is written
// now so the consensus engine doesn't need reshaping later, even though
// results.length is always 1 in the current MVP.
function baseConfidence(results: DiagnosticAIProviderResult[], rationale: string[]): number {
  if (results.length <= 1) {
    rationale.push("Base confidence of 70 for a single AI provider (no independent second opinion yet).");
    return 70;
  }

  const topCauses = results.map((r) => r.output.rankedCauses[0]?.cause.trim().toLowerCase());
  const allAgree = topCauses.every((c) => c && c === topCauses[0]);
  if (allAgree) {
    rationale.push(`Base confidence of 85: all ${results.length} providers independently agreed on the top-ranked cause.`);
    return 85;
  }
  rationale.push(`Base confidence of 55: the ${results.length} providers disagreed on the top-ranked cause.`);
  return 55;
}

export function computeConfidence(
  results: DiagnosticAIProviderResult[],
  input: CanonicalDiagnosticInput,
  safety: Pick<SafetyReviewResult, "verdict">,
): ConfidenceResult {
  const rationale: string[] = [];
  let confidence = baseConfidence(results, rationale);

  if (!input.vehicle.vin) {
    confidence -= 20;
    rationale.push("-20: no VIN was provided or extracted.");
  }

  const hasComplaintOrSymptoms = Boolean(input.complaint?.trim()) || input.symptoms.length > 0;
  if (!hasComplaintOrSymptoms) {
    confidence -= 10;
    rationale.push("-10: no customer complaint or symptoms were provided.");
  }

  if (input.imageOnlyPdf) {
    confidence -= 15;
    rationale.push("-15: the source file was an image-only PDF with no reliable text extraction.");
  }

  if (input.extractionWarnings.length > 0) {
    confidence -= 10;
    rationale.push(`-10: ${input.extractionWarnings.length} unresolved extraction warning(s) from the scan report.`);
  }

  if (safety.verdict === "block") {
    confidence -= 25;
    rationale.push("-25: the safety review blocked part of the AI's recommendation.");
  } else if (safety.verdict === "warn") {
    confidence -= 10;
    rationale.push("-10: the safety review flagged a warning on part of the AI's recommendation.");
  }

  const missingInfoCount = results[0]?.output.missingInformation.length ?? 0;
  if (missingInfoCount > 0) {
    const deduction = Math.min(missingInfoCount * PER_MISSING_INFO_DEDUCTION, MAX_MISSING_INFO_DEDUCTION);
    confidence -= deduction;
    rationale.push(
      `-${deduction}: the AI itself flagged ${missingInfoCount} piece(s) of missing information (capped at -${MAX_MISSING_INFO_DEDUCTION}).`,
    );
  }

  const clamped = Math.max(MIN_CONFIDENCE, Math.min(MAX_CONFIDENCE, confidence));
  if (clamped !== confidence) {
    rationale.push(`Clamped to the ${MIN_CONFIDENCE}-${MAX_CONFIDENCE} range (never claims full certainty or total failure).`);
  }

  return { confidence: clamped, rationale };
}
