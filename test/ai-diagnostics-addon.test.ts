import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";

vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabase = fake;
  return { createAdminClient: () => fake };
});

const { recordAiDiagnosticUsage, AiDiagnosticLimitExceededError } = await import("@/lib/ai-diagnostics/usage");
const { grantAddOnPack, getAddOnBalanceSummary } = await import("@/lib/ai-diagnostics/addon-balances");

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

// Mirrors migration 0024's extended record_ai_diagnostic_usage() and new
// grant_addon_pack() closely enough to unit test the TS layer without a
// real database — same approach as test/ai-diagnostics-usage.test.ts.
function registerFakeRpcHandlers() {
  fake().setRpcHandler("grant_addon_pack", (args) => {
    const userId = args.p_user_id as string;
    const packId = args.p_pack_id as string;
    const reports = args.p_reports as number;
    const creemOrderId = args.p_creem_order_id as string;

    const already = fake()
      .dump("report_addon_balances")
      .some((r) => r.creem_order_id === creemOrderId);
    if (already) return null;

    fake().seed("report_addon_balances", [
      {
        user_id: userId,
        pack_id: packId,
        reports_purchased: reports,
        reports_remaining: reports,
        creem_order_id: creemOrderId,
        purchased_at: new Date().toISOString(),
      },
    ]);
    return null;
  });

  fake().setRpcHandler("record_ai_diagnostic_usage", (args) => {
    const userId = args.p_user_id as string;
    const requestId = args.p_request_id as string;
    const feature = args.p_feature as string;
    const accessLevel = args.p_access_level as string;
    const dailyLimit = args.p_daily_limit as number | null;
    const monthlyLimit = args.p_monthly_limit as number | null;

    const rows = fake().dump("ai_diagnostic_usage");
    const already = rows.some((r) => r.user_id === userId && r.request_id === requestId);
    if (already) return "already_recorded";

    const today = new Date().toISOString().slice(0, 10);
    const thisMonth = new Date().toISOString().slice(0, 7);

    if (dailyLimit !== null) {
      const dailyCount = rows.filter(
        (r) =>
          r.user_id === userId && r.access_level === accessLevel && (r.created_at as string).slice(0, 10) === today,
      ).length;
      // Daily limit is a hard ceiling — never bypassed by add-on credits,
      // checked and enforced before any add-on lookup even happens.
      if (dailyCount >= dailyLimit) return "daily_limit_exceeded";
    }

    if (monthlyLimit !== null) {
      const monthlyCount = rows.filter(
        (r) =>
          r.user_id === userId && r.access_level === accessLevel && (r.created_at as string).slice(0, 7) === thisMonth,
      ).length;
      if (monthlyCount >= monthlyLimit) {
        const balances = fake()
          .dump("report_addon_balances")
          .filter((r) => r.user_id === userId && (r.reports_remaining as number) > 0)
          .sort((a, b) => String(a.purchased_at).localeCompare(String(b.purchased_at)));
        const oldest = balances[0];
        if (oldest) {
          oldest.reports_remaining = (oldest.reports_remaining as number) - 1;
          fake().seed("ai_diagnostic_usage", [
            { user_id: userId, request_id: requestId, feature, access_level: accessLevel, created_at: new Date().toISOString() },
          ]);
          return "recorded_via_addon";
        }
        return "monthly_limit_exceeded";
      }
    }

    fake().seed("ai_diagnostic_usage", [
      { user_id: userId, request_id: requestId, feature, access_level: accessLevel, created_at: new Date().toISOString() },
    ]);
    return "recorded";
  });
}

// Generates a timestamp within the current UTC month, on a day guaranteed
// to differ from "today" (every month has at least 28 days), so seeded
// fixture rows count toward a monthly total without also tripping the
// daily count for today — same helper as test/ai-diagnostics-usage.test.ts.
function pastDayInCurrentMonthIso(offsetIndex: number): string {
  const now = new Date();
  const todayDate = now.getUTCDate();
  const candidates = Array.from({ length: 27 }, (_, i) => i + 1).filter((d) => d !== todayDate);
  const day = candidates[offsetIndex % candidates.length];
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, 12, offsetIndex)).toISOString();
}

beforeEach(() => {
  fake().reset();
  registerFakeRpcHandlers();
});

describe("grantAddOnPack / getAddOnBalanceSummary", () => {
  it("grants a balance that getAddOnBalanceSummary reflects", async () => {
    await grantAddOnPack({ userId: "user-1", packId: "addon-10", reports: 10, creemOrderId: "order-1" });

    const summary = await getAddOnBalanceSummary("user-1");
    expect(summary.totalReportsRemaining).toBe(10);
    expect(summary.packs).toEqual([
      expect.objectContaining({ packId: "addon-10", reportsRemaining: 10 }),
    ]);
  });

  it("is idempotent on creemOrderId — a webhook retry never grants twice", async () => {
    await grantAddOnPack({ userId: "user-1", packId: "addon-10", reports: 10, creemOrderId: "order-1" });
    await grantAddOnPack({ userId: "user-1", packId: "addon-10", reports: 10, creemOrderId: "order-1" });

    const summary = await getAddOnBalanceSummary("user-1");
    expect(summary.totalReportsRemaining).toBe(10);
    expect(summary.packs).toHaveLength(1);
  });

  it("only includes packs with credits remaining", async () => {
    await grantAddOnPack({ userId: "user-2", packId: "addon-10", reports: 10, creemOrderId: "order-2" });
    fake().dump("report_addon_balances")[0].reports_remaining = 0;

    const summary = await getAddOnBalanceSummary("user-2");
    expect(summary.totalReportsRemaining).toBe(0);
    expect(summary.packs).toHaveLength(0);
  });
});

describe("recordAiDiagnosticUsage — add-on credit consumption", () => {
  it("covers a request via an add-on credit once the monthly allowance is exhausted, and decrements the balance", async () => {
    // Pro's monthly allowance is 20 (src/lib/pricing.ts) — seed 20 prior
    // full-report rows on past days this month (not today, so the daily
    // count for today stays at 0) so the very next call is over the
    // monthly budget specifically, not the daily one.
    const seeded = Array.from({ length: 20 }, (_, i) => ({
      user_id: "user-pro",
      request_id: `seed-${i}`,
      feature: "scan_report",
      access_level: "full",
      created_at: pastDayInCurrentMonthIso(i),
    }));
    fake().seed("ai_diagnostic_usage", seeded);

    // Without an add-on balance, the 21st request is rejected.
    await expect(
      recordAiDiagnosticUsage({ userId: "user-pro", requestId: "req-no-addon", feature: "scan_report", plan: "pro" }),
    ).rejects.toThrow(AiDiagnosticLimitExceededError);

    // Grant a pack, then retry with a fresh requestId — should succeed.
    await grantAddOnPack({ userId: "user-pro", packId: "addon-10", reports: 10, creemOrderId: "order-pro-1" });

    await expect(
      recordAiDiagnosticUsage({ userId: "user-pro", requestId: "req-with-addon", feature: "scan_report", plan: "pro" }),
    ).resolves.toBe("full");

    const summary = await getAddOnBalanceSummary("user-pro");
    expect(summary.totalReportsRemaining).toBe(9);
  });

  it("same-day usage is never throttled by a fixed daily ceiling — only the monthly cap (then add-on credits) gates it", async () => {
    await grantAddOnPack({ userId: "user-pro-2", packId: "addon-50", reports: 50, creemOrderId: "order-pro-2" });

    // Run well past what used to be pro's fixed daily limit (3), all in one
    // day — every one of these must succeed since there's no daily cap
    // anymore, and the monthly allowance (20) hasn't been touched yet.
    for (let i = 0; i < 10; i++) {
      await expect(
        recordAiDiagnosticUsage({ userId: "user-pro-2", requestId: `req-${i}`, feature: "scan_report", plan: "pro" }),
      ).resolves.toBe("full");
    }

    // The add-on balance is untouched — nothing here ever needed it, since
    // the monthly allowance alone covered all 10 same-day requests.
    const summary = await getAddOnBalanceSummary("user-pro-2");
    expect(summary.totalReportsRemaining).toBe(50);
  });

  it("free plan is still blocked outright, regardless of any add-on balance — free never reaches 'full' access at all", async () => {
    await grantAddOnPack({ userId: "user-free", packId: "addon-10", reports: 10, creemOrderId: "order-free-1" });

    await expect(
      recordAiDiagnosticUsage({ userId: "user-free", requestId: "req-1", feature: "chat", plan: "free" }),
    ).rejects.toThrow(AiDiagnosticLimitExceededError);
  });
});
