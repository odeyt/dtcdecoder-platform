// One-off $9.99 single-report purchases (single_report_purchases —
// migration 0037). Deliberately separate from report_addon_balances
// (addon-balances.ts) — see that migration's header comment for why: this
// mechanism is checked BEFORE record_ai_diagnostic_usage is ever called,
// so a Free-tier customer's hard 0/day ceiling is never in the way of
// redeeming a purchase they already paid for.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

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
