import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";

vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabase = fake;
  return { createAdminClient: () => fake };
});

const {
  getActiveSubscriptionCounts,
  estimateMonthlyRecurringRevenueUsd,
  getReportCostRollup,
  getTopCostReports,
  getAddOnPackRollup,
  getUsersApproachingLimit,
  estimateGrossMargin,
} = await import("@/lib/admin-profitability");

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

beforeEach(() => {
  fake().reset();
});

describe("getActiveSubscriptionCounts / estimateMonthlyRecurringRevenueUsd", () => {
  it("counts only active subscriptions, ignores past_due/canceled", () => {
    fake().seed("subscriptions", [
      { id: "s1", plan: "pro", status: "active" },
      { id: "s2", plan: "pro", status: "active" },
      { id: "s3", plan: "pro", status: "canceled" },
      { id: "s4", plan: "workshop", status: "active" },
      { id: "s5", plan: "workshop", status: "past_due" },
    ]);

    return getActiveSubscriptionCounts().then((counts) => {
      expect(counts).toEqual({ pro: 2, workshop: 1, compedPro: 0, compedWorkshop: 0 });
      // Pro $39/mo x2 + Workshop $99/mo x1 = $177.
      expect(estimateMonthlyRecurringRevenueUsd(counts)).toBe(177);
    });
  });

  it("is zero for no active subscriptions", async () => {
    const counts = await getActiveSubscriptionCounts();
    expect(estimateMonthlyRecurringRevenueUsd(counts)).toBe(0);
  });
});

// Only the Creem webhook ever sets status='canceled', so a row it cannot
// reach stays 'active' indefinitely and keeps contributing to MRR after its
// period ends. Production hit exactly that: a Pro subscription whose period
// ended 2026-08-01 was still counted on 2026-08-03, inflating reported MRR
// by $39/mo with no code path able to expire it.
describe("getActiveSubscriptionCounts — a lapsed period is not active", () => {
  const future = new Date(Date.now() + 7 * 864e5).toISOString();
  const past = new Date(Date.now() - 2 * 864e5).toISOString();

  it("excludes a status-active row whose period has already ended", async () => {
    fake().seed("subscriptions", [
      { id: "s1", plan: "pro", status: "active", current_period_end: past },
      { id: "s2", plan: "workshop", status: "active", current_period_end: future },
    ]);

    const counts = await getActiveSubscriptionCounts();
    expect(counts).toEqual({ pro: 0, workshop: 1, compedPro: 0, compedWorkshop: 0 });
    expect(estimateMonthlyRecurringRevenueUsd(counts)).toBe(99);
  });

  it("still counts a row with no period end, rather than under-reporting", async () => {
    // upsertSubscriptionFromWebhook writes `current_period_end ?? null`, so a
    // genuine paid subscription can arrive without one. Dropping those would
    // trade over-reporting for under-reporting.
    fake().seed("subscriptions", [
      { id: "s1", plan: "pro", status: "active", current_period_end: null },
      { id: "s2", plan: "workshop", status: "active" },
    ]);

    const counts = await getActiveSubscriptionCounts();
    expect(counts).toEqual({ pro: 1, workshop: 1, compedPro: 0, compedWorkshop: 0 });
  });

  it("counts a row whose period end is unparseable instead of silently dropping it", async () => {
    fake().seed("subscriptions", [
      { id: "s1", plan: "pro", status: "active", current_period_end: "not-a-date" },
    ]);

    const counts = await getActiveSubscriptionCounts();
    expect(counts).toEqual({ pro: 1, workshop: 0, compedPro: 0, compedWorkshop: 0 });
  });

  it("does not resurrect a canceled row just because its period is still future", async () => {
    fake().seed("subscriptions", [
      { id: "s1", plan: "pro", status: "canceled", current_period_end: future },
      { id: "s2", plan: "workshop", status: "past_due", current_period_end: future },
    ]);

    const counts = await getActiveSubscriptionCounts();
    expect(counts).toEqual({ pro: 0, workshop: 0, compedPro: 0, compedWorkshop: 0 });
  });

  it("reports zero when every active row has lapsed", async () => {
    fake().seed("subscriptions", [
      { id: "s1", plan: "pro", status: "active", current_period_end: past },
      { id: "s2", plan: "workshop", status: "active", current_period_end: past },
    ]);

    const counts = await getActiveSubscriptionCounts();
    expect(estimateMonthlyRecurringRevenueUsd(counts)).toBe(0);
  });
});

// A comped subscription grants real entitlement but produces no revenue.
// Before migration 0045 nothing distinguished it from a paid one, so
// production reported $99/mo of Workshop revenue against $0/mo of actual
// recurring charges. Deleting such rows was rejected because entitlement is
// derived from this same table — deleting one silently revokes access.
describe("getActiveSubscriptionCounts — comped vs paid", () => {
  const future = new Date(Date.now() + 7 * 864e5).toISOString();
  const past = new Date(Date.now() - 2 * 864e5).toISOString();

  it("keeps comped subscriptions out of the billable counts", async () => {
    fake().seed("subscriptions", [
      { id: "s1", plan: "workshop", status: "active", current_period_end: future, is_comp: true },
      { id: "s2", plan: "pro", status: "active", current_period_end: future, is_comp: false },
    ]);

    const counts = await getActiveSubscriptionCounts();
    expect(counts).toEqual({ pro: 1, workshop: 0, compedPro: 0, compedWorkshop: 1 });
    // Only the paid Pro row contributes: $39, not $39 + $99.
    expect(estimateMonthlyRecurringRevenueUsd(counts)).toBe(39);
  });

  it("reports comped accounts separately instead of hiding them", async () => {
    fake().seed("subscriptions", [
      { id: "s1", plan: "pro", status: "active", current_period_end: future, is_comp: true },
      { id: "s2", plan: "workshop", status: "active", current_period_end: future, is_comp: true },
    ]);

    const counts = await getActiveSubscriptionCounts();
    expect(counts.compedPro).toBe(1);
    expect(counts.compedWorkshop).toBe(1);
    // The accounts exist and are visible, but no revenue is claimed for them.
    expect(estimateMonthlyRecurringRevenueUsd(counts)).toBe(0);
  });

  it("treats a missing is_comp as paid, so a pre-migration row is never silently dropped", async () => {
    fake().seed("subscriptions", [
      { id: "s1", plan: "pro", status: "active", current_period_end: future },
    ]);

    const counts = await getActiveSubscriptionCounts();
    expect(counts.pro).toBe(1);
    expect(counts.compedPro).toBe(0);
  });

  it("excludes a lapsed comped row from both counts", async () => {
    fake().seed("subscriptions", [
      { id: "s1", plan: "workshop", status: "active", current_period_end: past, is_comp: true },
    ]);

    const counts = await getActiveSubscriptionCounts();
    expect(counts).toEqual({ pro: 0, workshop: 0, compedPro: 0, compedWorkshop: 0 });
  });

  it("reproduces the exact production case: one lapsed paid row, one comped row", async () => {
    fake().seed("subscriptions", [
      // Pro, period ended — excluded by the expiry rule (PR #27).
      { id: "s1", plan: "pro", status: "active", current_period_end: past, is_comp: true },
      // Workshop, current period, comped — entitlement yes, revenue no.
      { id: "s2", plan: "workshop", status: "active", current_period_end: future, is_comp: true },
    ]);

    const counts = await getActiveSubscriptionCounts();
    expect(estimateMonthlyRecurringRevenueUsd(counts)).toBe(0);
    expect(counts.compedWorkshop).toBe(1);
  });
});

describe("getReportCostRollup", () => {
  it("aggregates completed cost by plan/model/operation, and counts failed attempts separately", async () => {
    const now = new Date().toISOString();
    fake().seed("ai_diagnostic_runs", [
      {
        user_id: "u1",
        plan: "pro",
        model_id: "claude-sonnet-5",
        status: "completed",
        operation_type: "standard_report",
        estimated_total_cost_micros: 500_000,
        created_at: now,
      },
      {
        user_id: "u1",
        plan: "pro",
        model_id: "claude-haiku-4-5",
        status: "completed",
        operation_type: "additional_language",
        estimated_total_cost_micros: 100_000,
        created_at: now,
      },
      {
        user_id: "u2",
        plan: "workshop",
        model_id: "claude-sonnet-5",
        status: "failed",
        operation_type: "standard_report",
        estimated_total_cost_micros: null,
        created_at: now,
      },
    ]);

    const rollup = await getReportCostRollup();
    expect(rollup.totalCompletedReports).toBe(2);
    expect(rollup.totalFailedAttempts).toBe(1);
    expect(rollup.totalCostUsd).toBeCloseTo(0.6, 5);
    expect(rollup.avgCostPerCompletedReportUsd).toBeCloseTo(0.3, 5);

    const proRow = rollup.byPlan.find((r) => r.plan === "pro");
    expect(proRow?.completedReports).toBe(2);
    const workshopRow = rollup.byPlan.find((r) => r.plan === "workshop");
    expect(workshopRow?.failedAttempts).toBe(1);
    expect(workshopRow?.completedReports).toBe(0);

    const sonnetRow = rollup.byModel.find((r) => r.modelId === "claude-sonnet-5");
    expect(sonnetRow?.completedReports).toBe(1);
    const haikuRow = rollup.byModel.find((r) => r.modelId === "claude-haiku-4-5");
    expect(haikuRow?.totalCostUsd).toBeCloseTo(0.1, 5);

    const translationRow = rollup.byOperationType.find((r) => r.operationType === "additional_language");
    expect(translationRow?.completedReports).toBe(1);
  });

  it("only includes rows from the current calendar month", async () => {
    const lastMonth = new Date(Date.UTC(2020, 0, 1)).toISOString();
    fake().seed("ai_diagnostic_runs", [
      {
        user_id: "u1",
        plan: "pro",
        model_id: "claude-sonnet-5",
        status: "completed",
        operation_type: "standard_report",
        estimated_total_cost_micros: 999_999,
        created_at: lastMonth,
      },
    ]);

    const rollup = await getReportCostRollup();
    expect(rollup.totalCompletedReports).toBe(0);
  });

  it("returns all-zero rollup with no rows", async () => {
    const rollup = await getReportCostRollup();
    expect(rollup.totalCompletedReports).toBe(0);
    expect(rollup.totalFailedAttempts).toBe(0);
    expect(rollup.totalCostUsd).toBe(0);
    expect(rollup.avgCostPerCompletedReportUsd).toBe(0);
  });
});

describe("getTopCostReports", () => {
  it("returns completed reports with a recorded cost, ordered highest-cost first", async () => {
    const now = new Date().toISOString();
    fake().seed("ai_diagnostic_runs", [
      { user_id: "u1", plan: "pro", model_id: "claude-sonnet-5", operation_type: "standard_report", status: "completed", estimated_total_cost_micros: 100_000, created_at: now },
      { user_id: "u2", plan: "pro", model_id: "claude-sonnet-5", operation_type: "standard_report", status: "completed", estimated_total_cost_micros: 900_000, created_at: now },
      { user_id: "u3", plan: "pro", model_id: "claude-sonnet-5", operation_type: "standard_report", status: "failed", estimated_total_cost_micros: null, created_at: now },
    ]);

    const top = await getTopCostReports(10);
    expect(top).toHaveLength(2);
    expect(top[0].userId).toBe("u2");
    expect(top[0].costUsd).toBeCloseTo(0.9, 5);
    expect(top[1].userId).toBe("u1");
  });
});

describe("getAddOnPackRollup", () => {
  it("sums purchased/remaining/consumed across all balances", async () => {
    fake().seed("report_addon_balances", [
      { reports_purchased: 10, reports_remaining: 4 },
      { reports_purchased: 25, reports_remaining: 25 },
    ]);

    const rollup = await getAddOnPackRollup();
    expect(rollup.totalPurchased).toBe(35);
    expect(rollup.totalRemaining).toBe(29);
    expect(rollup.totalConsumed).toBe(6);
  });
});

describe("getUsersApproachingLimit", () => {
  it("flags a user at or above the threshold percentage of their plan's monthly limit", async () => {
    const now = new Date().toISOString();
    // Pro's monthly limit is 20 — 16 completed reports is 80%.
    const rows = Array.from({ length: 16 }, () => ({
      user_id: "user-close",
      plan: "pro",
      model_id: "claude-sonnet-5",
      operation_type: "standard_report",
      status: "completed",
      estimated_total_cost_micros: 10_000,
      created_at: now,
    }));
    fake().seed("ai_diagnostic_runs", rows);
    fake().seed("ai_diagnostic_runs", [
      { user_id: "user-far", plan: "workshop", model_id: "claude-sonnet-5", operation_type: "standard_report", status: "completed", estimated_total_cost_micros: 10_000, created_at: now },
    ]);

    const nearLimit = await getUsersApproachingLimit(0.8);
    expect(nearLimit).toHaveLength(1);
    expect(nearLimit[0].userId).toBe("user-close");
    expect(nearLimit[0].reportsUsedThisMonth).toBe(16);
    expect(nearLimit[0].monthlyLimit).toBe(20);
    expect(nearLimit[0].usedPct).toBeCloseTo(0.8, 5);
  });
});

describe("estimateGrossMargin", () => {
  it("computes gross profit and margin percentage", () => {
    const margin = estimateGrossMargin(1000, 200);
    expect(margin.grossProfitUsd).toBe(800);
    expect(margin.marginPct).toBe(80);
  });

  it("returns null margin percentage when revenue is zero, rather than dividing by zero", () => {
    const margin = estimateGrossMargin(0, 50);
    expect(margin.grossProfitUsd).toBe(-50);
    expect(margin.marginPct).toBeNull();
  });
});
