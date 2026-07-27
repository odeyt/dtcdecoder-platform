// Aggregate (daily/monthly/per-user) USD budget guard — the dimension the
// existing per-request cost ceiling (cost.ts guardCostCeiling) does not
// cover. Reads real spend from the SAME cost-ledger table
// (ai_diagnostic_runs, migrations 0016/0023) rather than a new aggregate
// table, per "prefer extending existing architecture" — every successful
// AND failed run is already logged there with estimated_total_cost_micros,
// so a sum-over-window query is all this needs. See
// docs/AI_BUDGET_GUARD.md.
//
// A dimension with no configured limit (BUDGET_LIMITS_USD.<x> === undefined)
// is skipped entirely — never treated as an implicit $0 ceiling. This is
// the OWNER-level control and takes priority over any plan/entitlement
// check: it can restrict or stop generation for every plan, including
// Workshop, when the site owner's real spend crosses a configured
// threshold.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { microsToUsd } from "@/lib/ai-diagnostics/cost";
import { getBudgetLimitsUsd, getBudgetPercentThresholds } from "@/lib/ai-diagnostics/orchestrator-config";

export type BudgetState = "normal" | "warning" | "restrict" | "hard_stop";

const STATE_SEVERITY: Record<BudgetState, number> = { normal: 0, warning: 1, restrict: 2, hard_stop: 3 };

function worseOf(a: BudgetState, b: BudgetState): BudgetState {
  return STATE_SEVERITY[b] > STATE_SEVERITY[a] ? b : a;
}

export interface BudgetStatus {
  state: BudgetState;
  reasons: string[];
}

export class BudgetHardStopError extends Error {
  constructor(readonly reasons: string[]) {
    super(`AI diagnostic generation is temporarily paused: ${reasons.join("; ")}`);
    this.name = "BudgetHardStopError";
  }
}

function utcMidnightIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

function utcMonthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

async function sumCostMicros(
  since: string,
  userId?: string,
): Promise<number> {
  const admin = createAdminClient();
  let query = admin
    .from("ai_diagnostic_runs")
    .select("estimated_total_cost_micros")
    .gte("created_at", since)
    .not("estimated_total_cost_micros", "is", null);
  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + (row.estimated_total_cost_micros ?? 0), 0);
}

function considerDimension(
  worst: BudgetState,
  reasons: string[],
  usedUsd: number,
  limitUsd: number | undefined,
  label: string,
  thresholds: ReturnType<typeof getBudgetPercentThresholds>,
): BudgetState {
  if (limitUsd === undefined || limitUsd <= 0) return worst;
  const pct = (usedUsd / limitUsd) * 100;
  if (pct >= thresholds.hardStop) {
    reasons.push(`${label}: $${usedUsd.toFixed(2)}/$${limitUsd.toFixed(2)} (${pct.toFixed(0)}%, hard stop)`);
    return worseOf(worst, "hard_stop");
  }
  if (pct >= thresholds.restrict) {
    reasons.push(`${label}: $${usedUsd.toFixed(2)}/$${limitUsd.toFixed(2)} (${pct.toFixed(0)}%, restricted)`);
    return worseOf(worst, "restrict");
  }
  if (pct >= thresholds.warning) {
    reasons.push(`${label}: $${usedUsd.toFixed(2)}/$${limitUsd.toFixed(2)} (${pct.toFixed(0)}%, warning)`);
    return worseOf(worst, "warning");
  }
  return worst;
}

// Computed fresh on every call (no caching) — deliberately: a budget guard
// that can serve a stale "normal" reading past the real hard-stop moment
// defeats the entire point of having one. The read itself is a handful of
// indexed aggregate queries (ai_diagnostic_runs_created_cost_idx, migration
// 0023), cheap relative to the AI call it's gating.
export async function computeBudgetState(userId: string): Promise<BudgetStatus> {
  const [ownerDaily, ownerMonthly, userDaily, userMonthly] = await Promise.all([
    sumCostMicros(utcMidnightIso()),
    sumCostMicros(utcMonthStartIso()),
    sumCostMicros(utcMidnightIso(), userId),
    sumCostMicros(utcMonthStartIso(), userId),
  ]);

  let state: BudgetState = "normal";
  const reasons: string[] = [];
  const limits = getBudgetLimitsUsd();
  const thresholds = getBudgetPercentThresholds();

  state = considerDimension(state, reasons, microsToUsd(ownerDaily), limits.daily, "Owner daily budget", thresholds);
  state = considerDimension(state, reasons, microsToUsd(ownerMonthly), limits.monthly, "Owner monthly budget", thresholds);
  state = considerDimension(state, reasons, microsToUsd(userDaily), limits.perUserDaily, "Per-user daily budget", thresholds);
  // No multi-tenant "shop" entity exists in this schema (see
  // docs/MULTI_MODEL_ORCHESTRATOR.md) — per-shop-monthly is evaluated as an
  // alias of this same user's monthly spend, not silently skipped.
  state = considerDimension(
    state,
    reasons,
    microsToUsd(userMonthly),
    limits.perShopMonthly,
    "Per-shop (=per-user) monthly budget",
    thresholds,
  );

  return { state, reasons };
}

// Called before the primary provider is invoked. Throws only at hard_stop —
// warning/restrict states are returned for the router/orchestrator to act
// on (reduced sampling, review suppression) without blocking generation
// entirely.
export function assertBudgetAllowsGeneration(status: BudgetStatus): void {
  if (status.state === "hard_stop") {
    throw new BudgetHardStopError(status.reasons);
  }
}
