// Monthly scan-analysis usage gate. Mirrors src/lib/ai/assistant.ts's
// checkRateLimit/getUsageSummary shape, but backed by the scan_usage
// ledger (one row per case that has consumed a slot) rather than an
// incrementing counter — see consume_scan_usage_slot() in
// supabase/migrations/0013_scan_diagnostics_ai_and_usage.sql for why that
// makes a retried analyze attempt free of double-charging.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { scanMonthlyLimit } from "@/lib/scan-diagnostics/entitlements";
import { ScanUsageLimitExceededError } from "@/lib/scan-diagnostics/api-errors";
import type { SubscriptionPlan } from "@/lib/types";

const UPGRADE_COPY: Record<SubscriptionPlan, string> = {
  free: "You've used this month's Free plan scan analysis allowance. Upgrade to Pro or Workshop for a much larger monthly limit.",
  pro: "You've used this month's Pro plan scan analysis allowance. Upgrade to Workshop for a higher monthly limit.",
  workshop: "You've used this month's Workshop plan scan analysis allowance. It resets at the start of next month.",
};

// Idempotent per case: calling this again for a case that already
// consumed a slot (e.g. retrying after a provider failure) succeeds
// without re-checking or re-counting against the monthly limit — see the
// consume_scan_usage_slot RPC.
export async function consumeScanUsageSlot(
  userId: string,
  caseId: string,
  plan: SubscriptionPlan,
): Promise<void> {
  const supabase = createAdminClient();
  const limit = scanMonthlyLimit(plan);

  const { data, error } = await supabase.rpc("consume_scan_usage_slot", {
    p_user_id: userId,
    p_case_id: caseId,
    p_limit: limit,
  });
  if (error) throw error;

  if (data !== true) {
    throw new ScanUsageLimitExceededError(UPGRADE_COPY[plan]);
  }
}

export interface ScanUsageSummary {
  used: number;
  limit: number;
}

export async function getScanUsageSummary(
  userId: string,
  plan: SubscriptionPlan,
): Promise<ScanUsageSummary> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("get_monthly_scan_usage", { p_user_id: userId });
  if (error) throw error;

  return { used: typeof data === "number" ? data : 0, limit: scanMonthlyLimit(plan) };
}
