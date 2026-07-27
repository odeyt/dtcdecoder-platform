// Deterministic confidence/safety router — decides whether the primary
// assessor's result needs an Anthropic review, and produces a logged
// RoutingReason for every case (docs/MULTI_MODEL_ORCHESTRATOR.md §Router).
// Every input here is either already-computed deterministic evidence
// (confidence.ts, safety-rules.ts, category-classification.ts) or a plain
// boolean the orchestrator itself observed (schema repair attempted,
// budget state) — this module never calls an AI provider and never
// re-derives evidence a dedicated module already owns.
import type { CanonicalDiagnosticInput, DiagnosticAiOutput } from "@/lib/scan-diagnostics/schemas";
import type { SafetyReviewResult } from "@/lib/scan-diagnostics/safety-rules";
import { isSafetyCriticalSystem } from "@/lib/scan-diagnostics/parsers/category-classification";
import { getRouterThresholds } from "@/lib/ai-diagnostics/orchestrator-config";
import type { BudgetState } from "@/lib/ai-diagnostics/budget-guard";

export type RoutingReason =
  | "PRIMARY_ONLY"
  | "LOW_CONFIDENCE"
  | "SAFETY_CRITICAL"
  | "CONTRADICTORY_DATA"
  | "UNSUPPORTED_CLAIM"
  | "MULTIMODAL_REQUIRED"
  | "QUALITY_AUDIT"
  | "PREMIUM_CONSENSUS"
  | "PROVIDER_FAILURE"
  | "BUDGET_LIMIT"
  | "HUMAN_REVIEW_REQUIRED";

export interface RoutingDecision {
  escalateToReview: boolean;
  reason: RoutingReason;
  /** True whenever a human technician must review before the result is trusted, independent of whether an AI review also ran. */
  humanReviewRequired: boolean;
  /** Free-form detail for the persisted ai_routing_decisions row / logs — never shown to the customer. */
  explanation: string;
}

// A pin-number or torque-spec claim is inherently unsupported here: this
// app supplies no curated OEM pinout/torque reference data to any provider
// (see DEFAULT_SYSTEM_PROMPT's own "do not invent... pin numbers... torque
// specifications" instruction) — so a provider stating one anyway is, by
// construction, fabricated, not merely "unverified." Conservative patterns:
// only matches an explicit pin/torque NUMBER, not general prose mentioning
// "the connector" or "torque it down."
const PIN_NUMBER_CLAIM_PATTERN = /\bpin\s*(?:#|number)?\s*[a-z]?\d+\b/i;
const TORQUE_SPEC_CLAIM_PATTERN = /\b\d+(?:\.\d+)?\s*(?:ft[\s-]?lbs?|in[\s-]?lbs?|n[\s-]?m|nm)\b/i;

function collectOutputText(output: DiagnosticAiOutput): string {
  return [
    output.summary,
    ...output.rankedCauses.flatMap((c) => [c.cause, c.rationale]),
    ...output.recommendedTests.flatMap((t) => [t.step, t.purpose, t.expectedResult]),
  ].join(" \n ");
}

export function detectUnsupportedClaims(output: DiagnosticAiOutput): string[] {
  const text = collectOutputText(output);
  const claims: string[] = [];
  if (PIN_NUMBER_CLAIM_PATTERN.test(text)) claims.push("Output states a specific connector/pin number.");
  if (TORQUE_SPEC_CLAIM_PATTERN.test(text)) claims.push("Output states a specific torque value.");
  return claims;
}

// Stable, deterministic per-case sampling (NOT Math.random()) — the same
// case must always land on the same side of the quality-audit sample, so a
// retry or a second view of the same case doesn't flip in/out of audit.
function stableSamplePercent(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash % 100;
}

export interface RoutingInput {
  caseId: string;
  input: CanonicalDiagnosticInput;
  output: DiagnosticAiOutput;
  confidenceScore: number;
  safety: SafetyReviewResult;
  budgetState: BudgetState;
  /** True when the primary provider's structured output required a schema-repair retry to parse at all. */
  schemaRepairAttempted?: boolean;
  /** True when the primary provider returned a structurally valid but incomplete result (e.g. zero recommended tests for a faulted case). */
  primaryPartialData?: boolean;
  /** Reserved for a future premium/consensus plan tier — never true today (no such tier exists yet, see docs/MULTI_MODEL_ORCHESTRATOR.md). */
  premiumConsensusRequested?: boolean;
  /** Overrides ROUTER_THRESHOLDS.qualityAuditPercent for this call only — used by the orchestrator to reduce audit sampling at the budget "warning" state (spec: "75-89%: reduce quality-audit sampling") without changing the module-level default other callers/tests rely on. */
  qualityAuditPercentOverride?: number;
}

// Priority order matters: the FIRST matching condition below is the reason
// code logged, even when several conditions are simultaneously true (e.g. a
// low-confidence AND safety-critical case is logged as SAFETY_CRITICAL,
// the more actionable/severe fact). escalateToReview is independent of
// budget EXCEPT at the restrict/hard-stop budget states, where only
// safety-critical and premium-consensus cases still get a review — see
// docs/AI_BUDGET_GUARD.md §75-90-100 behavior.
export function decideRouting(params: RoutingInput): RoutingDecision {
  const { caseId, input, output, confidenceScore, safety, budgetState } = params;
  const thresholds = getRouterThresholds();

  const currentSafetySystemFault = input.systems.some(
    (s) => s.status === "faulted" && isSafetyCriticalSystem(s.systemName),
  );
  const isSafetyCritical = safety.verdict === "block" || safety.verdict === "warn" || currentSafetySystemFault;

  const unsupportedClaims = detectUnsupportedClaims(output);
  const hasContradiction = output.rankedCauses.some((c) => c.contradictingEvidence.length > 0);

  const humanReviewRequired = safety.verdict === "block" || confidenceScore < thresholds.humanReviewConfidenceThreshold;

  // Budget gating — applies to every candidate reason EXCEPT safety-critical
  // and premium-consensus (spec: "90-99%: disable optional Anthropic
  // reviews except safety-critical and premium cases"; 100%: no AI
  // generation at all, handled upstream by the budget guard itself before
  // the primary call even runs, so this router never sees a hard_stop case
  // in practice — the check is kept here anyway as a defensive backstop).
  const budgetBlocksOptionalReview = budgetState === "restrict" || budgetState === "hard_stop";

  if (isSafetyCritical) {
    return {
      escalateToReview: true,
      reason: "SAFETY_CRITICAL",
      humanReviewRequired,
      explanation: currentSafetySystemFault
        ? "A current fault exists in a safety-critical system (SRS/ABS/steering/brake/restraint)."
        : `Deterministic safety review returned verdict "${safety.verdict}".`,
    };
  }

  if (params.premiumConsensusRequested) {
    return {
      escalateToReview: true,
      reason: "PREMIUM_CONSENSUS",
      humanReviewRequired,
      explanation: "Premium consensus mode was requested for this case.",
    };
  }

  if (budgetBlocksOptionalReview) {
    return {
      escalateToReview: false,
      reason: "BUDGET_LIMIT",
      humanReviewRequired,
      explanation: `Budget state is "${budgetState}" — optional (non-safety-critical) review suppressed.`,
    };
  }

  if (params.schemaRepairAttempted) {
    return {
      escalateToReview: true,
      reason: "LOW_CONFIDENCE",
      humanReviewRequired,
      explanation: "The primary provider's structured output required a schema-repair attempt before it parsed.",
    };
  }

  if (params.primaryPartialData) {
    return {
      escalateToReview: true,
      reason: "LOW_CONFIDENCE",
      humanReviewRequired,
      explanation: "The primary provider returned structurally valid but incomplete data.",
    };
  }

  if (unsupportedClaims.length > 0) {
    return {
      escalateToReview: true,
      reason: "UNSUPPORTED_CLAIM",
      humanReviewRequired,
      explanation: unsupportedClaims.join(" "),
    };
  }

  if (hasContradiction) {
    return {
      escalateToReview: true,
      reason: "CONTRADICTORY_DATA",
      humanReviewRequired,
      explanation: "At least one ranked cause lists contradicting evidence.",
    };
  }

  if (input.imageOnlyPdf) {
    // Gemini is disabled by default (docs/MULTI_MODEL_ORCHESTRATOR.md) — this
    // reason is logged for observability even though no multimodal call
    // actually runs; the orchestrator falls back to the existing
    // manual-entry-only text path, matching Phase 7's disabled-Gemini
    // fallback requirement.
    return {
      escalateToReview: false,
      reason: "MULTIMODAL_REQUIRED",
      humanReviewRequired,
      explanation: "Source was an image-only PDF; multimodal re-reading would help but Gemini is disabled.",
    };
  }

  if (confidenceScore < thresholds.reviewConfidenceThreshold) {
    return {
      escalateToReview: true,
      reason: "LOW_CONFIDENCE",
      humanReviewRequired,
      explanation: `Confidence score ${confidenceScore} is below the review threshold ${thresholds.reviewConfidenceThreshold}.`,
    };
  }

  const qualityAuditPercent = params.qualityAuditPercentOverride ?? thresholds.qualityAuditPercent;
  if (stableSamplePercent(caseId) < qualityAuditPercent) {
    return {
      escalateToReview: true,
      reason: "QUALITY_AUDIT",
      humanReviewRequired,
      explanation: `Case selected for quality-audit sampling (${qualityAuditPercent}% rate).`,
    };
  }

  return {
    escalateToReview: false,
    reason: "PRIMARY_ONLY",
    humanReviewRequired,
    explanation: "No escalation condition matched — primary result stands alone.",
  };
}
