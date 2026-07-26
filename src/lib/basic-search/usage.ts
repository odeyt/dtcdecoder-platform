// Basic (non-AI) DTC search rate limiting — Free plan only, per
// docs/PRICING_AND_AI_COST_AUDIT.md. Backed by the basic_search_usage
// ledger (migration 0022), same atomic UTC-day/month pattern as
// src/lib/ai-diagnostics/usage.ts. Only a SUCCESSFUL interactive search
// (searchDtcCodes() returning at least one result) should ever call
// recordBasicSearchUsage — never call it for a failed/empty search, and
// never call it at all for a direct /dtc/[code] page view.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { BASIC_SEARCH_LIMITS } from "@/lib/pricing";
import type { SubscriptionPlan } from "@/lib/types";

export type BasicSearchIdentity =
  | { type: "user"; id: string }
  | { type: "anon"; id: string };

export class BasicSearchLimitExceededError extends Error {
  readonly code = "BASIC_SEARCH_LIMIT_REACHED";

  constructor(
    message: string,
    readonly usedToday: number,
    readonly dailyLimit: number,
    readonly usedThisMonth: number,
    readonly monthlyLimit: number,
  ) {
    super(message);
    this.name = "BasicSearchLimitExceededError";
  }
}

// Only Free has a limit — paid plans always resolve to `null`/`null`
// (unlimited), so this is a no-op reservation call for them (still
// recorded for observability, but never blocks). Callers should still
// pass the identity for paid users so the ledger has a complete picture,
// even though the limit check never triggers.
export async function recordBasicSearchUsage(
  identity: BasicSearchIdentity,
  plan: SubscriptionPlan,
): Promise<void> {
  const limits = BASIC_SEARCH_LIMITS[plan];
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("record_basic_search_usage", {
    p_identifier_type: identity.type,
    p_identifier: identity.id,
    p_daily_limit: limits.dailyLimit,
    p_monthly_limit: limits.monthlyLimit,
  });
  if (error) throw error;

  if (data === "daily_limit_exceeded" || data === "monthly_limit_exceeded") {
    const summary = await getBasicSearchUsageSummary(identity);
    throw new BasicSearchLimitExceededError(
      `You have used ${summary.usedToday} searches today or ${summary.usedThisMonth} this month. Upgrade for professional AI diagnostics.`,
      summary.usedToday,
      limits.dailyLimit ?? 0,
      summary.usedThisMonth,
      limits.monthlyLimit ?? 0,
    );
  }
}

export interface BasicSearchUsageSummary {
  usedToday: number;
  usedThisMonth: number;
}

interface UsageSummaryRow {
  searches_used_today: number;
  searches_used_this_month: number;
}

export async function getBasicSearchUsageSummary(
  identity: BasicSearchIdentity,
): Promise<BasicSearchUsageSummary> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("get_basic_search_usage_summary", {
    p_identifier_type: identity.type,
    p_identifier: identity.id,
  });
  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as UsageSummaryRow | undefined;
  return {
    usedToday: row?.searches_used_today ?? 0,
    usedThisMonth: row?.searches_used_this_month ?? 0,
  };
}

// Free-only pre-check (no side effect) — lets the search page decide
// whether to even attempt the search / show the "limit reached" state
// before running a query, without consuming anything itself. The actual
// atomic reservation still happens in recordBasicSearchUsage after a
// successful search; this is purely for rendering the right UI state.
export async function hasBasicSearchAllowanceRemaining(
  identity: BasicSearchIdentity,
  plan: SubscriptionPlan,
): Promise<boolean> {
  const limits = BASIC_SEARCH_LIMITS[plan];
  if (limits.dailyLimit === null && limits.monthlyLimit === null) return true;

  const summary = await getBasicSearchUsageSummary(identity);
  if (limits.dailyLimit !== null && summary.usedToday >= limits.dailyLimit) return false;
  if (limits.monthlyLimit !== null && summary.usedThisMonth >= limits.monthlyLimit) return false;
  return true;
}
