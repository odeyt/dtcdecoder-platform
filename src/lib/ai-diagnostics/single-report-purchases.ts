// One-off Professional Diagnostic Report purchases (single_report_purchases
// — migration 0037). Deliberately separate from report_addon_balances
// (addon-balances.ts) — see that migration's header comment for why: this
// mechanism is checked BEFORE record_ai_diagnostic_usage is ever called,
// so a Free-tier customer's hard 0/day ceiling is never in the way of
// redeeming a purchase they already paid for.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { PROFESSIONAL_REPORT_ONE_TIME } from "@/lib/pricing";
import { recordEvent } from "@/lib/analytics/events";

// Idempotent on creemOrderId — a webhook retry for the same order never
// grants a second purchase (see the partial unique index in migration
// 0037). Throws only on a genuine database error.
export async function grantSingleReportPurchase(params: {
  userId: string;
  creemOrderId: string;
}): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("grant_single_report_purchase", {
    p_user_id: params.userId,
    p_creem_order_id: params.creemOrderId,
  });
  if (error) throw error;
  await recordEvent("one_time_report_credit_granted", { userId: params.userId });
}

// Atomically claims the user's oldest unused purchase for this case.
// Returns false (no throw) when the user has no unused purchase — the
// caller falls back to its normal plan-based rejection in that case, this
// is never treated as an error condition.
export async function redeemSingleReportPurchase(params: {
  userId: string;
  caseId: string;
}): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("redeem_single_report_purchase", {
    p_user_id: params.userId,
    p_case_id: params.caseId,
  });
  if (error) throw error;
  return Boolean(data);
}

export interface SingleReportUnlock {
  expiresAt: string;
}

// The single check resolveReportAccess needs: is this specific case
// currently unlocked by a still-valid single-report purchase, regardless
// of the viewer's current plan? Returns null once expires_at has passed —
// the caller then falls back to the normal plan-derived access level
// (view access "locks again", nothing is deleted — see migration 0037).
export async function getActiveSingleReportUnlock(caseId: string): Promise<SingleReportUnlock | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("single_report_purchases")
    .select("expires_at")
    .eq("case_id", caseId)
    .eq("status", "consumed")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  return data ? { expiresAt: data.expires_at as string } : null;
}

// Batch form of the above, for rendering an "expires in N days" badge
// across a whole case list without one query per row.
export async function getActiveSingleReportUnlocksForCases(
  caseIds: string[],
): Promise<Map<string, string>> {
  if (caseIds.length === 0) return new Map();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("single_report_purchases")
    .select("case_id, expires_at")
    .in("case_id", caseIds)
    .eq("status", "consumed")
    .gt("expires_at", new Date().toISOString());
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.case_id as string, row.expires_at as string]));
}

// Atomically claims one of the case's remaining follow-up allowance
// (PROFESSIONAL_REPORT_ONE_TIME.maxFollowUps) — see migration 0043's
// consume_report_followup for the concurrency-safety argument. Returns
// false, never throws, both when the case has no active purchase unlock
// and when the allowance is already exhausted; callers must not
// distinguish the two beyond "not allowed right now" (see
// getFollowUpStatus for a caller that needs to show a used/max count).
export async function consumeReportFollowUp(caseId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("consume_report_followup", {
    p_case_id: caseId,
    p_max_followups: PROFESSIONAL_REPORT_ONE_TIME.maxFollowUps,
  });
  if (error) throw error;
  return Boolean(data);
}

// Same contract as consumeReportFollowUp, for the single permitted final-
// report regeneration per purchased case.
export async function consumeReportRegeneration(caseId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("consume_report_regeneration", {
    p_case_id: caseId,
    p_max_regenerations: PROFESSIONAL_REPORT_ONE_TIME.maxRegenerations,
  });
  if (error) throw error;
  return Boolean(data);
}

// Real, current count of unredeemed purchases — for the account dashboard's
// "N professional report credits available" display and the bounded
// post-checkout poll (see /api/account/report-credits). Never a
// placeholder or an estimate.
export async function getUnusedSingleReportPurchaseCount(userId: string): Promise<number> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("single_report_purchases")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "unused");
  if (error) throw error;
  return (data ?? []).length;
}

export interface ReportUsageStatus {
  followUpsUsed: number;
  followUpsMax: number;
  regenerationsUsed: number;
  regenerationsMax: number;
}

// Read-only status for UI display ("3 of 5 follow-ups used") and for the
// 6th-attempt structured limit response (see the caller's use of this to
// report exact remaining counts, not just a bare rejection). Returns null
// when the case has no active single-report unlock at all.
export async function getReportUsageStatus(caseId: string): Promise<ReportUsageStatus | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("single_report_purchases")
    .select("followup_count, regeneration_count")
    .eq("case_id", caseId)
    .eq("status", "consumed")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    followUpsUsed: data.followup_count as number,
    followUpsMax: PROFESSIONAL_REPORT_ONE_TIME.maxFollowUps,
    regenerationsUsed: data.regeneration_count as number,
    regenerationsMax: PROFESSIONAL_REPORT_ONE_TIME.maxRegenerations,
  };
}
