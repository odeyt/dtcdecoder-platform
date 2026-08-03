// Read-only data layer for /admin/profitability. Per an explicit product
// decision, this slice does NOT move pricing.ts/model-routing.ts into an
// admin-editable database table — the admin page only displays current
// values; changing a quota, cost guard, or model route still means
// editing code and redeploying.
//
// Every query here aggregates in JS after a bounded fetch (current
// calendar month's ai_diagnostic_runs rows) rather than a database-side
// aggregate view/RPC. That's a deliberate simplicity tradeoff for a
// product with near-zero real usage today, not a scalability claim — if
// this table ever grows into the tens of thousands of rows/month, replace
// the JS reduce() calls below with a real SQL aggregate (a new migration),
// not by changing the shape this module returns.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { PAID_PLANS, AI_DIAGNOSTIC_ENTITLEMENTS, type PaidPlan } from "@/lib/pricing";
import { microsToUsd } from "@/lib/ai-diagnostics/cost";
import type { SubscriptionPlan } from "@/lib/types";

interface AiDiagnosticRunRow {
  user_id: string;
  plan: SubscriptionPlan;
  model_id: string;
  status: "completed" | "failed";
  operation_type: string;
  estimated_total_cost_micros: number | null;
  created_at: string;
}

function currentMonthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

async function fetchThisMonthsRuns(): Promise<AiDiagnosticRunRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ai_diagnostic_runs")
    .select("user_id, plan, model_id, status, operation_type, estimated_total_cost_micros, created_at")
    .gte("created_at", currentMonthStartIso());
  if (error) throw error;
  return (data ?? []) as AiDiagnosticRunRow[];
}

export interface ActiveSubscriptionCounts {
  pro: number;
  workshop: number;
}

// "Active" mirrors the subscription_status enum's own 'active' value —
// past_due/canceled subscriptions don't count toward active users or MRR.
//
// Status alone is not sufficient, though. Only the Creem webhook ever moves
// a row to 'canceled', so a row it cannot reach stays 'active' forever and
// keeps contributing to MRR after its period has ended. Two ways that
// happens: a manually-created row (no creem_subscription_id, so the
// webhook's upsert can never match it), and a webhook delivery that is
// missed or never retried. Production hit the first case — a subscription
// whose period ended was still counted days later.
//
// A row whose known period has ended is therefore excluded regardless of
// status. `current_period_end IS NULL` still counts: the webhook writes
// `subscription.current_period_end ?? null`, so a real paid subscription
// can legitimately arrive without one, and dropping those would trade
// over-reporting for under-reporting.
//
// This fixes the arithmetic, not the inputs. Rows that were never backed by
// a payment still count while their period is in the future — that is a
// data question (are these comped or phantom?), not something this query
// can answer.
export async function getActiveSubscriptionCounts(): Promise<ActiveSubscriptionCounts> {
  const supabase = createAdminClient();
  const now = Date.now();
  // The period check is applied here rather than in the query because it is
  // a two-branch condition (null OR future) and the row set being fetched
  // is exactly the set being counted — status-active subscriptions — so
  // nothing extra is read to do it.
  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan, current_period_end")
    .eq("status", "active");
  if (error) throw error;

  const counts: ActiveSubscriptionCounts = { pro: 0, workshop: 0 };
  for (const row of data ?? []) {
    const periodEnd = row.current_period_end ? Date.parse(row.current_period_end) : null;
    // An unparseable timestamp is treated the same as a missing one — count
    // it, and let the row be visible, rather than silently dropping revenue
    // because of a malformed value.
    const lapsed = periodEnd !== null && !Number.isNaN(periodEnd) && periodEnd <= now;
    if (lapsed) continue;

    if (row.plan === "pro") counts.pro++;
    else if (row.plan === "workshop") counts.workshop++;
  }
  return counts;
}

// Estimated MRR from active-subscription COUNTS x current list price — NOT
// real Creem-reported revenue (this schema doesn't store actual charged
// amounts anywhere, only plan/status). Ignores yearly vs. monthly mix and
// any launch-pricing discount a given subscriber may have locked in.
// Explicitly an operational estimate, not a verified financial figure —
// see COST_GUARDS' own "operational defaults, not marketing claims" note
// in src/lib/pricing.ts.
export function estimateMonthlyRecurringRevenueUsd(counts: ActiveSubscriptionCounts): number {
  return counts.pro * PAID_PLANS.pro.monthlyPriceUsd + counts.workshop * PAID_PLANS.workshop.monthlyPriceUsd;
}

export interface PlanCostRollup {
  plan: SubscriptionPlan;
  completedReports: number;
  failedAttempts: number;
  totalCostUsd: number;
}

export interface ModelCostRollup {
  modelId: string;
  completedReports: number;
  totalCostUsd: number;
}

export interface OperationTypeCostRollup {
  operationType: string;
  completedReports: number;
  totalCostUsd: number;
}

export interface ReportCostRollup {
  byPlan: PlanCostRollup[];
  byModel: ModelCostRollup[];
  byOperationType: OperationTypeCostRollup[];
  totalCompletedReports: number;
  // Every releaseAiDiagnosticUsage call in this codebase (chat + scan) is
  // paired with a recordAiDiagnosticRun({status: 'failed'}) call, so this
  // count doubles as a "reservations released without consuming an
  // allowance" proxy — there's no direct way to count releases themselves,
  // since a released ai_diagnostic_usage row is hard-deleted, not flagged.
  totalFailedAttempts: number;
  totalCostUsd: number;
  avgCostPerCompletedReportUsd: number;
}

export async function getReportCostRollup(): Promise<ReportCostRollup> {
  const runs = await fetchThisMonthsRuns();

  const byPlan = new Map<string, PlanCostRollup>();
  const byModel = new Map<string, ModelCostRollup>();
  const byOperationType = new Map<string, OperationTypeCostRollup>();
  let totalCompletedReports = 0;
  let totalFailedAttempts = 0;
  let totalCostMicros = 0;

  for (const run of runs) {
    const costMicros = run.estimated_total_cost_micros ?? 0;

    if (run.status === "completed") {
      totalCompletedReports++;
      totalCostMicros += costMicros;

      const plan = byPlan.get(run.plan) ?? { plan: run.plan, completedReports: 0, failedAttempts: 0, totalCostUsd: 0 };
      plan.completedReports++;
      plan.totalCostUsd += microsToUsd(costMicros);
      byPlan.set(run.plan, plan);

      const model = byModel.get(run.model_id) ?? { modelId: run.model_id, completedReports: 0, totalCostUsd: 0 };
      model.completedReports++;
      model.totalCostUsd += microsToUsd(costMicros);
      byModel.set(run.model_id, model);

      const opType =
        byOperationType.get(run.operation_type) ??
        { operationType: run.operation_type, completedReports: 0, totalCostUsd: 0 };
      opType.completedReports++;
      opType.totalCostUsd += microsToUsd(costMicros);
      byOperationType.set(run.operation_type, opType);
    } else {
      totalFailedAttempts++;
      const plan = byPlan.get(run.plan) ?? { plan: run.plan, completedReports: 0, failedAttempts: 0, totalCostUsd: 0 };
      plan.failedAttempts++;
      byPlan.set(run.plan, plan);
    }
  }

  return {
    byPlan: [...byPlan.values()],
    byModel: [...byModel.values()],
    byOperationType: [...byOperationType.values()],
    totalCompletedReports,
    totalFailedAttempts,
    totalCostUsd: microsToUsd(totalCostMicros),
    avgCostPerCompletedReportUsd: totalCompletedReports > 0 ? microsToUsd(totalCostMicros) / totalCompletedReports : 0,
  };
}

export interface TopCostReport {
  userId: string;
  plan: SubscriptionPlan;
  modelId: string;
  operationType: string;
  costUsd: number;
  createdAt: string;
}

export async function getTopCostReports(limitCount = 10): Promise<TopCostReport[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ai_diagnostic_runs")
    .select("user_id, plan, model_id, operation_type, estimated_total_cost_micros, created_at")
    .eq("status", "completed")
    .not("estimated_total_cost_micros", "is", null)
    .order("estimated_total_cost_micros", { ascending: false })
    .limit(limitCount);
  if (error) throw error;

  return (data ?? []).map((row) => ({
    userId: row.user_id as string,
    plan: row.plan as SubscriptionPlan,
    modelId: row.model_id as string,
    operationType: row.operation_type as string,
    costUsd: microsToUsd((row.estimated_total_cost_micros as number) ?? 0),
    createdAt: row.created_at as string,
  }));
}

export interface AddOnPackRollup {
  totalPurchased: number;
  totalRemaining: number;
  totalConsumed: number;
}

export async function getAddOnPackRollup(): Promise<AddOnPackRollup> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("report_addon_balances").select("reports_purchased, reports_remaining");
  if (error) throw error;

  const totalPurchased = (data ?? []).reduce((sum, r) => sum + ((r.reports_purchased as number) ?? 0), 0);
  const totalRemaining = (data ?? []).reduce((sum, r) => sum + ((r.reports_remaining as number) ?? 0), 0);
  return { totalPurchased, totalRemaining, totalConsumed: totalPurchased - totalRemaining };
}

export interface UserApproachingLimit {
  userId: string;
  plan: SubscriptionPlan;
  reportsUsedThisMonth: number;
  monthlyLimit: number;
  usedPct: number;
}

// Grouped from the SAME cost-ledger rows the rollups above already use, so
// this only reflects users who've actually run at least one completed
// report this month — not a live per-user count against every possible
// plan. thresholdPct default of 0.8 mirrors typical "approaching your
// limit" warning conventions; not a value the task specified.
export async function getUsersApproachingLimit(thresholdPct = 0.8): Promise<UserApproachingLimit[]> {
  const runs = await fetchThisMonthsRuns();

  const perUser = new Map<string, { plan: SubscriptionPlan; count: number }>();
  for (const run of runs) {
    if (run.status !== "completed") continue;
    const key = run.user_id;
    const entry = perUser.get(key) ?? { plan: run.plan, count: 0 };
    entry.count++;
    perUser.set(key, entry);
  }

  const result: UserApproachingLimit[] = [];
  for (const [userId, { plan, count }] of perUser) {
    const monthlyLimit = AI_DIAGNOSTIC_ENTITLEMENTS[plan].fullDiagnosticMonthlyLimit;
    if (monthlyLimit <= 0) continue;
    const usedPct = count / monthlyLimit;
    if (usedPct >= thresholdPct) {
      result.push({ userId, plan, reportsUsedThisMonth: count, monthlyLimit, usedPct });
    }
  }
  return result.sort((a, b) => b.usedPct - a.usedPct);
}

export interface GrossMarginEstimate {
  revenueUsd: number;
  costUsd: number;
  grossProfitUsd: number;
  marginPct: number | null;
}

export function estimateGrossMargin(revenueUsd: number, costUsd: number): GrossMarginEstimate {
  const grossProfitUsd = revenueUsd - costUsd;
  return {
    revenueUsd,
    costUsd,
    grossProfitUsd,
    marginPct: revenueUsd > 0 ? (grossProfitUsd / revenueUsd) * 100 : null,
  };
}

export type { PaidPlan };
