import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";

vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabase = fake;
  return { createAdminClient: () => fake };
});

const {
  recordDiagnosticEngineUsage,
  releaseDiagnosticEngineUsage,
  getDiagnosticEngineUsageSummary,
  DiagnosticEngineLimitExceededError,
} = await import("@/lib/diagnostic-engine/usage");

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

function registerFakeRpc() {
  fake().setRpcHandler("record_diagnostic_engine_usage", (args) => {
    const userId = args.p_user_id as string;
    const requestId = args.p_request_id as string;
    const feature = args.p_feature as string;
    const dailyLimit = args.p_daily_limit as number | null;
    const monthlyLimit = args.p_monthly_limit as number | null;

    const rows = fake().dump("diagnostic_engine_usage");
    if (rows.some((r) => r.user_id === userId && r.request_id === requestId)) return "already_recorded";

    const matching = rows.filter((r) => r.user_id === userId && r.feature === feature);
    if (dailyLimit !== null && matching.length >= dailyLimit) return "daily_limit_exceeded";
    if (monthlyLimit !== null && matching.length >= monthlyLimit) return "monthly_limit_exceeded";

    fake().seed("diagnostic_engine_usage", [
      { user_id: userId, request_id: requestId, feature, plan: args.p_plan, access_level: args.p_access_level },
    ]);
    return "recorded";
  });
  fake().setRpcHandler("get_diagnostic_engine_usage_summary", (args) => {
    const userId = args.p_user_id as string;
    const feature = args.p_feature as string;
    const rows = fake()
      .dump("diagnostic_engine_usage")
      .filter((r) => r.user_id === userId && r.feature === feature);
    return { used_today: rows.length, used_this_month: rows.length };
  });
}

beforeEach(() => {
  fake().reset();
  registerFakeRpc();
});

describe("recordDiagnosticEngineUsage", () => {
  it("records a fresh slot for a free user within their daily allowance", async () => {
    await recordDiagnosticEngineUsage({
      userId: "user-1",
      email: "free@example.com",
      requestId: "req-1",
      feature: "diagnostic_engine_turn",
      plan: "free",
    });
    expect(fake().dump("diagnostic_engine_usage")).toHaveLength(1);
  });

  it("throws DiagnosticEngineLimitExceededError once the free daily allowance is exhausted", async () => {
    for (let i = 0; i < 3; i++) {
      await recordDiagnosticEngineUsage({
        userId: "user-1",
        email: "free@example.com",
        requestId: `req-${i}`,
        feature: "diagnostic_engine_turn",
        plan: "free",
      });
    }
    try {
      await recordDiagnosticEngineUsage({
        userId: "user-1",
        email: "free@example.com",
        requestId: "req-over",
        feature: "diagnostic_engine_turn",
        plan: "free",
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DiagnosticEngineLimitExceededError);
      // Carried separately from the English `message` so clients can build
      // a translated sentence from code + limit instead of parsing text.
      expect(typeof (err as InstanceType<typeof DiagnosticEngineLimitExceededError>).limit).toBe("number");
    }
  });

  it("is idempotent — retrying the same requestId never consumes a second slot", async () => {
    await recordDiagnosticEngineUsage({
      userId: "user-1",
      email: "free@example.com",
      requestId: "req-1",
      feature: "diagnostic_engine_turn",
      plan: "free",
    });
    await recordDiagnosticEngineUsage({
      userId: "user-1",
      email: "free@example.com",
      requestId: "req-1",
      feature: "diagnostic_engine_turn",
      plan: "free",
    });
    expect(fake().dump("diagnostic_engine_usage")).toHaveLength(1);
  });

  it("never limits an internal allowlisted tester, even far past the free daily cap", async () => {
    process.env.DIAGNOSTIC_ENGINE_ALLOWED_EMAILS = "tester@example.com";
    for (let i = 0; i < 10; i++) {
      await recordDiagnosticEngineUsage({
        userId: "user-1",
        email: "tester@example.com",
        requestId: `req-${i}`,
        feature: "diagnostic_engine_turn",
        plan: "free",
      });
    }
    expect(fake().dump("diagnostic_engine_usage")).toHaveLength(10);
    delete process.env.DIAGNOSTIC_ENGINE_ALLOWED_EMAILS;
  });
});

describe("releaseDiagnosticEngineUsage", () => {
  it("frees a reserved slot so a subsequent call with the same requestId is a fresh reservation", async () => {
    await recordDiagnosticEngineUsage({
      userId: "user-1",
      email: "free@example.com",
      requestId: "req-1",
      feature: "diagnostic_engine_turn",
      plan: "free",
    });
    await releaseDiagnosticEngineUsage("user-1", "req-1");
    expect(fake().dump("diagnostic_engine_usage")).toHaveLength(0);
  });
});

describe("recordDiagnosticEngineUsage — concurrent reservation (Phase 2.2 Step 14)", () => {
  it("never over-admits past the daily limit when many distinct requests are dispatched concurrently", async () => {
    // Free plan's daily turn limit is 3 (entitlements.ts). Fire 6
    // concurrent distinct-requestId reservation attempts; exactly 3 must
    // succeed and 3 must be rejected, never more than 3 ever recorded.
    const attempts = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) =>
        recordDiagnosticEngineUsage({
          userId: "user-1",
          email: "free@example.com",
          requestId: `concurrent-${i}`,
          feature: "diagnostic_engine_turn",
          plan: "free",
        }),
      ),
    );

    const succeeded = attempts.filter((a) => a.status === "fulfilled").length;
    const rejected = attempts.filter((a) => a.status === "rejected").length;
    expect(succeeded).toBe(3);
    expect(rejected).toBe(3);
    expect(fake().dump("diagnostic_engine_usage")).toHaveLength(3);
  });

  it("concurrent retries of the SAME requestId never record more than one slot", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        recordDiagnosticEngineUsage({
          userId: "user-1",
          email: "free@example.com",
          requestId: "same-request",
          feature: "diagnostic_engine_turn",
          plan: "free",
        }),
      ),
    );
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(fake().dump("diagnostic_engine_usage").filter((r) => r.request_id === "same-request")).toHaveLength(1);
  });
});

describe("getDiagnosticEngineUsageSummary", () => {
  it("reflects real recorded usage plus the plan's own limits", async () => {
    await recordDiagnosticEngineUsage({
      userId: "user-1",
      email: "free@example.com",
      requestId: "req-1",
      feature: "diagnostic_engine_turn",
      plan: "free",
    });
    const summary = await getDiagnosticEngineUsageSummary("user-1", "free@example.com", "free", "diagnostic_engine_turn");
    expect(summary.usedToday).toBe(1);
    expect(summary.dailyLimit).toBeGreaterThan(0);
  });
});
