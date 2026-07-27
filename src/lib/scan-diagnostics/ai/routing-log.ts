// Persists one row per orchestrated case to ai_routing_decisions
// (migration 0029) — a case-level routing SUMMARY, distinct from
// ai_diagnostic_runs (one row per provider CALL, migration 0016/0023).
// Best-effort/non-fatal by design, matching the established
// recordAiDiagnosticRun pattern (usage.ts): a logging failure here must
// never turn into a user-facing error or block the case from completing.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RoutingDecision } from "@/lib/scan-diagnostics/ai/router";
import type { BudgetState } from "@/lib/ai-diagnostics/budget-guard";

export async function persistRoutingDecision(params: {
  caseId: string;
  primaryProviderId: string;
  reviewerProviderId: string | null;
  routing: RoutingDecision;
  budgetState: BudgetState;
  budgetReasons: string[];
  confidenceBefore: number;
  confidenceAfter: number;
}): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("ai_routing_decisions").insert({
    case_id: params.caseId,
    primary_provider: params.primaryProviderId,
    reviewer_provider: params.reviewerProviderId,
    reason_code: params.routing.reason,
    explanation: params.routing.explanation,
    confidence_before: params.confidenceBefore,
    confidence_after: params.confidenceAfter,
    budget_state: params.budgetState,
    budget_reasons: params.budgetReasons,
    human_review_required: params.routing.humanReviewRequired,
    escalated: params.routing.escalateToReview,
  });
  if (error) console.error("[ai-routing] failed to persist routing decision (non-fatal, never blocks the case)", error);
}
