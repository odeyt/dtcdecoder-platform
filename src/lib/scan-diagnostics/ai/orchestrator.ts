// The full multi-model diagnostic sequence (docs/MULTI_MODEL_ORCHESTRATOR.md):
// budget guard -> primary assessor -> deterministic confidence/safety
// evidence -> router -> conditional Anthropic review -> deterministic merge.
// Returns a DiagnosticAIProviderResult-shaped `result` so analyze.ts's
// existing downstream steps (runSafetyReview, computeConfidence,
// assembleAndPersistReport — all unchanged) consume it exactly like a
// single provider's result today; every extra field here is additional
// telemetry for the ai_routing_decisions row, never a second copy of logic
// analyze.ts already owns.
//
// Only called when AI_ORCHESTRATOR_ENABLED=true (see analyze.ts) — with the
// flag off, analyze.ts calls provider.runDiagnosis() directly, completely
// bypassing this file, so the pre-orchestrator behavior is byte-for-byte
// unchanged by this module's mere existence.
import "server-only";
import { getPrimaryProvider, getReviewerProvider } from "@/lib/scan-diagnostics/ai/registry";
import { decideRouting, type RoutingDecision } from "@/lib/scan-diagnostics/ai/router";
import { applyReviewCorrections } from "@/lib/scan-diagnostics/ai/review-merge";
import { runSafetyReview } from "@/lib/scan-diagnostics/safety-rules";
import { computeConfidence } from "@/lib/scan-diagnostics/confidence";
import {
  computeBudgetState,
  assertBudgetAllowsGeneration,
  type BudgetState,
} from "@/lib/ai-diagnostics/budget-guard";
import { getRouterThresholds } from "@/lib/ai-diagnostics/orchestrator-config";
import type { CanonicalDiagnosticInput } from "@/lib/scan-diagnostics/schemas";
import type { DiagnosticAIProviderResult } from "@/lib/scan-diagnostics/ai/provider";
import type { DiagnosticReview } from "@/lib/scan-diagnostics/ai/review-schema";

export interface OrchestrationOutcome {
  /** Same shape as a single provider's result — the primary's output, or the primary's output with reviewer corrections deterministically merged in. */
  result: DiagnosticAIProviderResult;
  routing: RoutingDecision;
  budgetState: BudgetState;
  budgetReasons: string[];
  reviewerProviderId: string | null;
  review: DiagnosticReview | null;
  reviewTokens: { input: number; output: number } | null;
  appliedCorrectionsCount: number;
  providersUsed: string[];
}

export async function runOrchestratedDiagnosis(
  caseId: string,
  userId: string,
  input: CanonicalDiagnosticInput,
): Promise<OrchestrationOutcome> {
  const budgetStatus = await computeBudgetState(userId);
  assertBudgetAllowsGeneration(budgetStatus);

  const primaryProvider = getPrimaryProvider();
  // A primary-provider failure (network, timeout, validation) propagates to
  // the caller unchanged — analyze.ts already has a complete, tested
  // failure path (release usage slot, log a failed scan_ai_runs/
  // ai_diagnostic_runs row, transition the case to "failed") that this
  // function must not duplicate or shadow.
  const primary = await primaryProvider.runDiagnosis(input);

  const safety = runSafetyReview(primary.output, input);
  const confidence = computeConfidence([primary], input, safety);

  // "75-89%: reduce quality-audit sampling" (docs/AI_BUDGET_GUARD.md) — the
  // ONLY behavioral change at the warning budget state; safety-critical and
  // human-review escalation are never reduced by budget pressure (router.ts
  // checks those conditions before quality-audit sampling regardless).
  // Halves whatever AI_QUALITY_AUDIT_PERCENT is currently configured to,
  // rather than a hardcoded number, so this always reflects the real rate.
  const qualityAuditPercentOverride =
    budgetStatus.state === "warning" ? getRouterThresholds().qualityAuditPercent / 2 : undefined;

  const routing = decideRouting({
    caseId,
    input,
    output: primary.output,
    confidenceScore: confidence.internalScore,
    safety,
    budgetState: budgetStatus.state,
    qualityAuditPercentOverride,
  });

  const providersUsed = [primary.providerId];

  if (!routing.escalateToReview) {
    return {
      result: primary,
      routing,
      budgetState: budgetStatus.state,
      budgetReasons: budgetStatus.reasons,
      reviewerProviderId: null,
      review: null,
      reviewTokens: null,
      appliedCorrectionsCount: 0,
      providersUsed,
    };
  }

  const reviewer = getReviewerProvider();
  if (!reviewer) {
    // ANTHROPIC_REVIEW_ENABLED=false — nothing to escalate to. The routing
    // decision is still logged as computed (so the persisted record shows
    // "this case WOULD have been reviewed"), but no second call happens and
    // BUDGET_PERCENT_THRESHOLDS below is referenced only for the explanation
    // text, not a behavior change.
    return {
      result: primary,
      routing: {
        ...routing,
        escalateToReview: false,
        explanation: `${routing.explanation} (Anthropic review is disabled — ANTHROPIC_REVIEW_ENABLED=false).`,
      },
      budgetState: budgetStatus.state,
      budgetReasons: budgetStatus.reasons,
      reviewerProviderId: null,
      review: null,
      reviewTokens: null,
      appliedCorrectionsCount: 0,
      providersUsed,
    };
  }

  try {
    const reviewResult = await reviewer.review(primary, input);
    const merge = applyReviewCorrections(primary.output, reviewResult.review);
    const mergedOutput = { ...merge.output };

    // Appended to missingInformation, not safetyWarnings — report.ts persists
    // scan_reports.safety_warnings from the DETERMINISTIC safety-rules
    // findings (runSafetyReview's output), never from the AI's own free-text
    // output.safetyWarnings array, which is scanned for rule-matching but
    // otherwise discarded. missingInformation IS carried straight through to
    // scan_reports.missing_information (see assembleAndPersistReport /
    // report.ts) and is the field the report UI actually renders, so this is
    // the correct place for a human-review notice to actually surface.
    const humanReviewRequired = routing.humanReviewRequired || reviewResult.review.decision === "human_review_required";
    if (humanReviewRequired) {
      mergedOutput.missingInformation = [
        ...mergedOutput.missingInformation,
        "This case requires direct review by a qualified technician — automated confidence in this result was insufficient to present it as final.",
      ];
    }

    providersUsed.push(reviewer.id);

    return {
      result: { ...primary, output: mergedOutput },
      routing: { ...routing, humanReviewRequired },
      budgetState: budgetStatus.state,
      budgetReasons: budgetStatus.reasons,
      reviewerProviderId: reviewer.id,
      review: reviewResult.review,
      reviewTokens: reviewResult.tokens,
      appliedCorrectionsCount: merge.appliedCorrections.length,
      providersUsed,
    };
  } catch (err) {
    // "Anthropic review unavailable: do not retry indefinitely; preserve the
    // primary output only if final deterministic safety validation allows
    // it" (Phase 17) — the primary output already passed runSafetyReview
    // above and will pass it again unchanged in analyze.ts, so returning it
    // here is exactly that "preserve if safety allows" path. A review-call
    // failure never fails the whole case.
    console.error("[orchestrator] Anthropic review call failed — proceeding with the unreviewed primary result", err);
    return {
      result: primary,
      routing: {
        ...routing,
        reason: "PROVIDER_FAILURE",
        explanation: `Review call failed (${err instanceof Error ? err.message : "unknown error"}); proceeding with unreviewed primary result.`,
      },
      budgetState: budgetStatus.state,
      budgetReasons: budgetStatus.reasons,
      reviewerProviderId: null,
      review: null,
      reviewTokens: null,
      appliedCorrectionsCount: 0,
      providersUsed,
    };
  }
}
