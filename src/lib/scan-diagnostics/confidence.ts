// Deterministic, documented confidence scoring — deliberately NOT a number
// the AI model itself picks. Combines model agreement (inert today since
// there's only one provider, but written to extend), evidence
// completeness, extraction quality, and the safety-review outcome into an
// internal score, while keeping every contributing factor visible in
// `rationale` so the report can explain *why* the level is what it is.
//
// The internal numeric score (`internalScore`) is a validated deterministic
// calculation with fully documented evidence inputs — it is NOT hidden, but
// it is also never the primary thing shown to a user. `confidenceLevel`
// (high/medium/low/insufficient_evidence), banded from that score, is what
// the UI and API surface as the headline value — see
// docs/DIAGNOSTIC_SCHEMA_V2.md and docs/DIAGNOSTIC_SAFETY_RULES.md for why
// a bare percentage is never presented as a calibrated real-world
// probability.
//
// FORMULA_VERSION below changes whenever a factor is added/removed/
// reweighted — persisted alongside the score so a report generated under
// an older formula is never silently reinterpreted under a newer one.
import type { CanonicalDiagnosticInput, ConfidenceLevel } from "@/lib/scan-diagnostics/schemas";
import type { DiagnosticAIProviderResult } from "@/lib/scan-diagnostics/ai/provider";
import type { SafetyReviewResult } from "@/lib/scan-diagnostics/safety-rules";

export const CONFIDENCE_FORMULA_VERSION = "2026-07-confidence-v2";

const MIN_CONFIDENCE = 10;
const MAX_CONFIDENCE = 95;
const MAX_MISSING_INFO_DEDUCTION = 20;
const PER_MISSING_INFO_DEDUCTION = 5;

// Banding thresholds — deliberately conservative: a single AI opinion with
// nothing missing lands at "medium" (70), not "high", since "high" is
// reserved for either independently-corroborated multi-provider agreement
// or a near-complete evidence set with no safety concerns.
const HIGH_THRESHOLD = 75;
const MEDIUM_THRESHOLD = 50;
const LOW_THRESHOLD = 30;

// Narrow, deterministic guard against one specific hallucination risk: the
// AI's `missingInformation` array (schemas.ts's DiagnosticAiOutputSchema)
// is free text the model writes itself, with nothing forcing it to be
// consistent with the actual canonical input it was given. Deterministic
// source facts must outrank an AI-generated description of those facts —
// if a technician-supplied complaint/symptoms were genuinely provided, the
// model must not be allowed to claim otherwise, since that claim would be
// factually false and would double-penalize confidence (see the
// deterministic "no customer complaint or symptoms" check below, which
// already handles the true-negative case correctly).
//
// Deliberately narrow: matches only the specific claim shape "no
// complaint/symptoms was/were supplied," not broader semantic rewriting of
// the model's prose — a wider pattern risks stripping legitimate content
// and introducing a different kind of error.
const FALSE_MISSING_COMPLAINT_PATTERN =
  /\bno\b[^.]{0,40}\b(customer\s+)?complaint\b[^.]{0,40}\b(provided|supplied|given|stated|described|available|mentioned)\b|\bcomplaint\b[^.]{0,40}\b(is|was)\s+(missing|not\s+provided|absent)\b/i;
const FALSE_MISSING_SYMPTOMS_PATTERN =
  /\bno\b[^.]{0,40}\bsymptoms?\b[^.]{0,40}\b(provided|supplied|given|stated|described|available|mentioned)\b|\bsymptoms?\b[^.]{0,40}\b(is|are|was|were)\s+(missing|not\s+provided|absent)\b/i;

export function sanitizeMissingInformation(
  missingInformation: string[],
  input: Pick<CanonicalDiagnosticInput, "complaint" | "symptoms">,
): { sanitized: string[]; removed: string[] } {
  const hasComplaint = Boolean(input.complaint?.trim());
  const hasSymptoms = input.symptoms.length > 0;
  const removed: string[] = [];
  const sanitized = missingInformation.filter((item) => {
    if (hasComplaint && FALSE_MISSING_COMPLAINT_PATTERN.test(item)) {
      removed.push(item);
      return false;
    }
    if (hasSymptoms && FALSE_MISSING_SYMPTOMS_PATTERN.test(item)) {
      removed.push(item);
      return false;
    }
    return true;
  });
  return { sanitized, removed };
}

function bandConfidence(score: number): ConfidenceLevel {
  if (score >= HIGH_THRESHOLD) return "high";
  if (score >= MEDIUM_THRESHOLD) return "medium";
  if (score >= LOW_THRESHOLD) return "low";
  return "insufficient_evidence";
}

export interface ConfidenceResult {
  confidenceLevel: ConfidenceLevel;
  internalScore: number;
  rationale: string[];
  formulaVersion: string;
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

  // --- Vehicle metadata completeness -------------------------------------
  if (!input.vehicle.vin) {
    confidence -= 20;
    rationale.push("-20: no VIN was provided or extracted.");
  }
  const vehicleFieldsKnown = [input.vehicle.year, input.vehicle.make, input.vehicle.model].filter(Boolean).length;
  if (vehicleFieldsKnown === 3) {
    confidence += 5;
    rationale.push("+5: year, make, and model were all identified.");
  } else if (vehicleFieldsKnown === 0) {
    confidence -= 5;
    rationale.push("-5: no year/make/model were identified — some system-specific reasoning may not apply.");
  }
  if (!input.vehicle.mileage) {
    confidence -= 3;
    rationale.push("-3: no mileage was provided — age/wear-related likelihood can't be weighed.");
  }

  // --- Complaint/symptom/freeze-frame/live-data completeness -------------
  const hasComplaintOrSymptoms = Boolean(input.complaint?.trim()) || input.symptoms.length > 0;
  if (!hasComplaintOrSymptoms) {
    confidence -= 10;
    rationale.push("-10: no customer complaint or symptoms were provided.");
  }
  if (input.freezeFrame.length === 0) {
    confidence -= 5;
    rationale.push("-5: no freeze-frame data was provided.");
  } else {
    confidence += 3;
    rationale.push("+3: freeze-frame data was available.");
  }
  if (input.liveData.length === 0) {
    confidence -= 5;
    rationale.push("-5: no live data was provided.");
  } else {
    confidence += 3;
    rationale.push("+3: live data was available.");
  }

  // --- Extraction quality / scan completeness -----------------------------
  if (input.imageOnlyPdf) {
    confidence -= 15;
    rationale.push("-15: the source file was an image-only PDF with no reliable text extraction.");
  }
  if (input.extractionWarnings.length > 0) {
    confidence -= 10;
    rationale.push(`-10: ${input.extractionWarnings.length} unresolved extraction warning(s) from the scan report.`);
  }
  const quality = input.scanExtractionQuality;
  if (quality?.truncated) {
    confidence -= 15;
    rationale.push(
      "-15: extraction appears INCOMPLETE — the source report declared more DTCs than were extracted for at least one system. Do not treat the DTC list as exhaustive.",
    );
  } else if (quality && quality.dtcsExpected != null && quality.dtcsExpected > 0) {
    confidence += 5;
    rationale.push(
      `+5: extraction is complete — all ${quality.dtcsExpected} declared DTC(s) across the source's own system counts were extracted.`,
    );
  }

  // --- Corroborating modules / pattern evidence ---------------------------
  const faultedSystems = input.systems.filter((s) => s.status === "faulted");
  const okSystems = input.systems.filter((s) => s.status === "ok");
  if (faultedSystems.length >= 3) {
    confidence += 5;
    rationale.push(`+5: findings are corroborated across ${faultedSystems.length} distinct faulted systems.`);
  }
  if (okSystems.length > 0) {
    confidence += 2;
    rationale.push(`+2: ${okSystems.length} system(s) were explicitly confirmed OK by the source report, narrowing scope.`);
  }
  const criticalPatterns = input.patterns.filter((p) => p.severity === "critical");
  if (criticalPatterns.length > 0) {
    confidence += 5;
    rationale.push(`+5: ${criticalPatterns.length} deterministic critical pattern(s) were detected, adding independent structural evidence.`);
  }

  // --- Status clarity / reference-only ambiguity --------------------------
  const referenceOnlyCount = input.priority?.historicalReferenceCodes.length ?? 0;
  const totalDtcCount = input.dtcs.length + (input.omittedFromPrompt?.count ?? 0);
  if (totalDtcCount > 0 && referenceOnlyCount / totalDtcCount > 0.5) {
    confidence -= 8;
    rationale.push(
      "-8: more than half of the DTCs are reference-only/unrecognized-status, and the report doesn't have a manufacturer-specific definition for most of them.",
    );
  }
  if (input.priority && input.priority.fixFirstCodes.length > 0) {
    confidence += 3;
    rationale.push("+3: at least one current, safety-relevant fault was clearly identified for priority.");
  }

  // --- Safety review outcome ----------------------------------------------
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

  const confidenceLevel = bandConfidence(clamped);
  rationale.push(`Internal score ${clamped}/100 (formula ${CONFIDENCE_FORMULA_VERSION}) maps to confidence level "${confidenceLevel}".`);

  return { confidenceLevel, internalScore: clamped, rationale, formulaVersion: CONFIDENCE_FORMULA_VERSION };
}
