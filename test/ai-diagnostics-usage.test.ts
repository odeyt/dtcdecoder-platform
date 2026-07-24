import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";

vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabase = fake;
  return { createAdminClient: () => fake };
});

const { recordAiDiagnosticUsage, getAiDiagnosticUsageSummary, AiDiagnosticLimitExceededError } = await import(
  "@/lib/ai-diagnostics/usage"
);

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

// Mirrors the plpgsql logic in record_ai_diagnostic_usage /
// get_ai_diagnostic_usage_summary (migration 0016) closely enough to unit
// test the TS layer without a real database. UTC day/month bucketing.
function registerFakeRpcHandlers() {
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
          r.user_id === userId &&
          r.access_level === accessLevel &&
          (r.created_at as string).slice(0, 10) === today,
      ).length;
      if (dailyCount >= dailyLimit) return "daily_limit_exceeded";
    }

    if (monthlyLimit !== null) {
      const monthlyCount = rows.filter(
        (r) =>
          r.user_id === userId &&
          r.access_level === accessLevel &&
          (r.created_at as string).slice(0, 7) === thisMonth,
      ).length;
      if (monthlyCount >= monthlyLimit) return "monthly_limit_exceeded";
    }

    fake().seed("ai_diagnostic_usage", [
      {
        user_id: userId,
        request_id: requestId,
        feature,
        access_level: accessLevel,
        created_at: new Date().toISOString(),
      },
    ]);
    return "recorded";
  });

  fake().setRpcHandler("get_ai_diagnostic_usage_summary", (args) => {
    const userId = args.p_user_id as string;
    const rows = fake()
      .dump("ai_diagnostic_usage")
      .filter((r) => r.user_id === userId);
    const today = new Date().toISOString().slice(0, 10);
    const thisMonth = new Date().toISOString().slice(0, 7);

    return [
      {
        previews_used_today: rows.filter(
          (r) => r.access_level === "preview" && (r.created_at as string).slice(0, 10) === today,
        ).length,
        full_reports_used_today: rows.filter(
          (r) => r.access_level === "full" && (r.created_at as string).slice(0, 10) === today,
        ).length,
        full_reports_used_this_month: rows.filter(
          (r) => r.access_level === "full" && (r.created_at as string).slice(0, 7) === thisMonth,
        ).length,
      },
    ];
  });
}

// Generates a timestamp within the current UTC month, on a day guaranteed
// to differ from "today" (every month has at least 28 days), so seeded
// fixture rows count toward a monthly total without also tripping the
// daily count for today.
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

describe("recordAiDiagnosticUsage — free plan (preview access)", () => {
  it("grants the first two previews of the day", async () => {
    const first = await recordAiDiagnosticUsage({
      userId: "user-1",
      requestId: "req-1",
      feature: "chat",
      plan: "free",
    });
    expect(first).toBe("preview");

    const second = await recordAiDiagnosticUsage({
      userId: "user-1",
      requestId: "req-2",
      feature: "scan_report",
      plan: "free",
    });
    expect(second).toBe("preview");
  });

  it("blocks the third preview of the day with FREE_DAILY_AI_LIMIT_REACHED", async () => {
    await recordAiDiagnosticUsage({ userId: "user-1", requestId: "req-1", feature: "chat", plan: "free" });
    await recordAiDiagnosticUsage({ userId: "user-1", requestId: "req-2", feature: "chat", plan: "free" });

    await expect(
      recordAiDiagnosticUsage({ userId: "user-1", requestId: "req-3", feature: "chat", plan: "free" }),
    ).rejects.toThrow(AiDiagnosticLimitExceededError);

    try {
      await recordAiDiagnosticUsage({ userId: "user-1", requestId: "req-3", feature: "chat", plan: "free" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AiDiagnosticLimitExceededError);
      const typed = err as InstanceType<typeof AiDiagnosticLimitExceededError>;
      expect(typed.code).toBe("FREE_DAILY_AI_LIMIT_REACHED");
      expect(typed.basicLookupAvailable).toBe(true);
      expect(typed.upgradeRequired).toBe(true);
      expect(typed.resetAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it("does not consume a second slot on a retry with the same requestId", async () => {
    await recordAiDiagnosticUsage({ userId: "user-2", requestId: "req-a", feature: "chat", plan: "free" });
    await recordAiDiagnosticUsage({ userId: "user-2", requestId: "req-a", feature: "chat", plan: "free" });
    await recordAiDiagnosticUsage({ userId: "user-2", requestId: "req-a", feature: "chat", plan: "free" });

    const rows = fake()
      .dump("ai_diagnostic_usage")
      .filter((r) => r.user_id === "user-2");
    expect(rows).toHaveLength(1);

    // A second, genuinely distinct request still has its full allowance —
    // the retries above didn't silently burn through it.
    await expect(
      recordAiDiagnosticUsage({ userId: "user-2", requestId: "req-b", feature: "chat", plan: "free" }),
    ).resolves.toBe("preview");
  });
});

describe("recordAiDiagnosticUsage — paid plans (full access)", () => {
  it("grants up to the daily limit, then blocks with DAILY_REPORT_LIMIT_REACHED", async () => {
    for (let i = 0; i < 5; i++) {
      await expect(
        recordAiDiagnosticUsage({ userId: "user-pro", requestId: `req-${i}`, feature: "scan_report", plan: "pro" }),
      ).resolves.toBe("full");
    }

    try {
      await recordAiDiagnosticUsage({ userId: "user-pro", requestId: "req-6th", feature: "scan_report", plan: "pro" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AiDiagnosticLimitExceededError);
      expect((err as InstanceType<typeof AiDiagnosticLimitExceededError>).code).toBe("DAILY_REPORT_LIMIT_REACHED");
    }
  });

  it("blocks with MONTHLY_REPORT_LIMIT_REACHED once the monthly cap is hit, even with daily room left", async () => {
    // Seed 30 prior full-report rows spread across the current month (not
    // today), so the daily check (0 used today) passes but the monthly
    // check (30 used, limit 30) does not.
    const seeded = Array.from({ length: 30 }, (_, i) => ({
      user_id: "user-pro-2",
      request_id: `seed-${i}`,
      feature: "scan_report",
      access_level: "full",
      created_at: pastDayInCurrentMonthIso(i),
    }));
    fake().seed("ai_diagnostic_usage", seeded);

    try {
      await recordAiDiagnosticUsage({
        userId: "user-pro-2",
        requestId: "req-new",
        feature: "scan_report",
        plan: "pro",
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AiDiagnosticLimitExceededError);
      expect((err as InstanceType<typeof AiDiagnosticLimitExceededError>).code).toBe("MONTHLY_REPORT_LIMIT_REACHED");
    }
  });

  it("workshop's higher allowance is enforced independently of pro's", async () => {
    for (let i = 0; i < 15; i++) {
      await expect(
        recordAiDiagnosticUsage({ userId: "user-ws", requestId: `req-${i}`, feature: "chat", plan: "workshop" }),
      ).resolves.toBe("full");
    }
    await expect(
      recordAiDiagnosticUsage({ userId: "user-ws", requestId: "req-16th", feature: "chat", plan: "workshop" }),
    ).rejects.toThrow(AiDiagnosticLimitExceededError);
  });

  it("blocks workshop with MONTHLY_REPORT_LIMIT_REACHED after 120 reports this month", async () => {
    const seeded = Array.from({ length: 120 }, (_, i) => ({
      user_id: "user-ws-2",
      request_id: `seed-${i}`,
      feature: "scan_report",
      access_level: "full",
      created_at: pastDayInCurrentMonthIso(i),
    }));
    fake().seed("ai_diagnostic_usage", seeded);

    try {
      await recordAiDiagnosticUsage({ userId: "user-ws-2", requestId: "req-new", feature: "scan_report", plan: "workshop" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AiDiagnosticLimitExceededError);
      expect((err as InstanceType<typeof AiDiagnosticLimitExceededError>).code).toBe("MONTHLY_REPORT_LIMIT_REACHED");
      // Workshop is the top plan — there's nothing higher to upgrade to.
      expect((err as InstanceType<typeof AiDiagnosticLimitExceededError>).upgradeRequired).toBe(false);
    }
  });

  it("concurrent requests for the same user never grant more slots than the daily limit", async () => {
    const attempts = Array.from({ length: 10 }, (_, i) =>
      recordAiDiagnosticUsage({ userId: "user-concurrent", requestId: `req-${i}`, feature: "chat", plan: "free" }).catch(
        () => null,
      ),
    );
    const results = await Promise.all(attempts);
    const granted = results.filter((r) => r === "preview");
    // Free plan's daily preview limit is 2 — no matter how many requests
    // race in at once, at most 2 may be granted.
    expect(granted.length).toBe(2);
  });

  it("a plan change takes effect immediately — the same user's limit reflects their CURRENT plan, not a cached one", async () => {
    await recordAiDiagnosticUsage({ userId: "user-switch", requestId: "req-1", feature: "chat", plan: "pro" });
    const proSummary = await getAiDiagnosticUsageSummary("user-switch", "pro");
    expect(proSummary.fullMonthlyLimit).toBe(30);

    // Same user, downgraded to free — the entitlement function has no
    // per-user state to go stale; it's purely a function of the plan
    // passed in, which the caller always re-resolves via getEffectivePlan.
    const freeSummary = await getAiDiagnosticUsageSummary("user-switch", "free");
    expect(freeSummary.previewDailyLimit).toBe(2);
    expect(freeSummary.accessLevel).toBe("preview");
  });
});

describe("getAiDiagnosticUsageSummary", () => {
  it("reflects real recorded usage, not a placeholder", async () => {
    await recordAiDiagnosticUsage({ userId: "user-3", requestId: "req-1", feature: "chat", plan: "free" });

    const summary = await getAiDiagnosticUsageSummary("user-3", "free");
    expect(summary.accessLevel).toBe("preview");
    expect(summary.previewsUsedToday).toBe(1);
    expect(summary.previewDailyLimit).toBe(2);
  });

  it("returns all zeros for a brand-new user with no usage rows", async () => {
    const summary = await getAiDiagnosticUsageSummary("user-never-used", "pro");
    expect(summary.fullReportsUsedToday).toBe(0);
    expect(summary.fullReportsUsedThisMonth).toBe(0);
    expect(summary.fullDailyLimit).toBe(5);
    expect(summary.fullMonthlyLimit).toBe(30);
  });
});
