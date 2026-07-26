// Add-on report pack balances (report_addon_balances — migration 0024).
// Consumption happens automatically and atomically inside
// record_ai_diagnostic_usage() (see usage.ts) when a plan's monthly
// allowance is exhausted — nothing here consumes a credit. This module is
// for granting a purchased pack (called by the Creem webhook) and reading
// a user's current balance (account page / future admin dashboard).
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADD_ON_PACKS, type AddOnPack } from "@/lib/pricing";

export function addOnPackById(packId: string): AddOnPack | null {
  return ADD_ON_PACKS.find((p) => p.id === packId) ?? null;
}

// Idempotent on creemOrderId — a webhook retry for the same order never
// grants a second balance (see the partial unique index in migration
// 0024). Throws only on a genuine database error, never on a duplicate
// grant attempt (that's a silent, correct no-op).
export async function grantAddOnPack(params: {
  userId: string;
  packId: string;
  reports: number;
  creemOrderId: string;
}): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("grant_addon_pack", {
    p_user_id: params.userId,
    p_pack_id: params.packId,
    p_reports: params.reports,
    p_creem_order_id: params.creemOrderId,
  });
  if (error) throw error;
}

export interface AddOnBalanceSummary {
  totalReportsRemaining: number;
  packs: { packId: string; reportsRemaining: number; purchasedAt: string }[];
}

// Real, current balance — never a placeholder. Only packs with credits
// left are included; a fully-consumed pack simply stops appearing.
export async function getAddOnBalanceSummary(userId: string): Promise<AddOnBalanceSummary> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("report_addon_balances")
    .select("pack_id, reports_remaining, purchased_at")
    .eq("user_id", userId)
    .gt("reports_remaining", 0)
    .order("purchased_at", { ascending: true });
  if (error) throw error;

  const packs = (data ?? []).map((row) => ({
    packId: row.pack_id as string,
    reportsRemaining: row.reports_remaining as number,
    purchasedAt: row.purchased_at as string,
  }));

  return {
    totalReportsRemaining: packs.reduce((sum, p) => sum + p.reportsRemaining, 0),
    packs,
  };
}
