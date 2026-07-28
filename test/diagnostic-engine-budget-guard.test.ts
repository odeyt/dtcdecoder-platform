import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";

vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabase = fake;
  return { createAdminClient: () => fake };
});

const {
  computeDiagnosticEngineBudgetState,
  assertDiagnosticEngineBudgetAllows,
  isDiagnosticEngineKillSwitchActive,
  getDiagnosticEngineBudgetLimitsUsd,
  DiagnosticEngineBudgetExceededError,
} = await import("@/lib/diagnostic-engine/budget-guard");

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

const BUDGET_ENV_VARS = [
  "DIAGNOSTIC_ENGINE_DAILY_BUDGET_USD",
  "DIAGNOSTIC_ENGINE_MONTHLY_BUDGET_USD",
  "DIAGNOSTIC_ENGINE_USER_DAILY_BUDGET_USD",
  "DIAGNOSTIC_ENGINE_USER_MONTHLY_BUDGET_USD",
  "DIAGNOSTIC_ENGINE_INTERNAL_DAILY_BUDGET_USD",
  "DIAGNOSTIC_ENGINE_PROVIDER_KILL_SWITCH",
];

function resetBudgetEnv() {
  for (const name of BUDGET_ENV_VARS) delete process.env[name];
}

function seedRun(userId: string, costUsd: number, opts: { isInternal?: boolean; createdAt?: string } = {}) {
  fake().seed("diagnostic_engine_runs", [
    {
      user_id: userId,
      case_id: "case-1",
      request_id: `req-${Math.random()}`,
      plan: "free",
      rollout_tier: "all_paid_users",
      is_internal: opts.isInternal ?? false,
      provider_called: true,
      estimated_cost_usd: costUsd,
      status: "completed",
      schema_validation_result: "valid",
      evidence_count: 1,
      hypothesis_count: 1,
      created_at: opts.createdAt ?? new Date().toISOString(),
    },
  ]);
}

beforeEach(() => {
  fake().reset();
  resetBudgetEnv();
});

afterEach(() => {
  resetBudgetEnv();
});

describe("getDiagnosticEngineBudgetLimitsUsd", () => {
  it("returns undefined for every dimension when no env vars are set (default: unlimited)", () => {
    const limits = getDiagnosticEngineBudgetLimitsUsd();
    expect(limits.globalDaily).toBeUndefined();
    expect(limits.globalMonthly).toBeUndefined();
    expect(limits.userDaily).toBeUndefined();
    expect(limits.userMonthly).toBeUndefined();
    expect(limits.internalDaily).toBeUndefined();
  });

  it("parses a configured env var as a positive number", () => {
    process.env.DIAGNOSTIC_ENGINE_DAILY_BUDGET_USD = "50";
    expect(getDiagnosticEngineBudgetLimitsUsd().globalDaily).toBe(50);
  });
});

describe("isDiagnosticEngineKillSwitchActive", () => {
  it("is false by default", () => {
    expect(isDiagnosticEngineKillSwitchActive()).toBe(false);
  });

  it("is true only when explicitly set to the literal string 'true'", () => {
    process.env.DIAGNOSTIC_ENGINE_PROVIDER_KILL_SWITCH = "true";
    expect(isDiagnosticEngineKillSwitchActive()).toBe(true);
    process.env.DIAGNOSTIC_ENGINE_PROVIDER_KILL_SWITCH = "1";
    expect(isDiagnosticEngineKillSwitchActive()).toBe(false);
  });
});

describe("computeDiagnosticEngineBudgetState — no limits configured", () => {
  it("is always normal when no budget env vars are set, regardless of recorded spend", async () => {
    seedRun("user-1", 500);
    const status = await computeDiagnosticEngineBudgetState("user-1", false);
    expect(status.state).toBe("normal");
  });
});

describe("computeDiagnosticEngineBudgetState — global daily budget", () => {
  it("reaches hard_stop once today's global spend meets the configured daily limit", async () => {
    process.env.DIAGNOSTIC_ENGINE_DAILY_BUDGET_USD = "10";
    seedRun("user-1", 6);
    seedRun("user-2", 5);
    const status = await computeDiagnosticEngineBudgetState("user-3", false);
    expect(status.state).toBe("hard_stop");
    expect(status.blockedScope).toBe("global_daily");
  });

  it("stays normal below the warning threshold", async () => {
    process.env.DIAGNOSTIC_ENGINE_DAILY_BUDGET_USD = "100";
    seedRun("user-1", 5);
    const status = await computeDiagnosticEngineBudgetState("user-2", false);
    expect(status.state).toBe("normal");
  });
});

describe("computeDiagnosticEngineBudgetState — global monthly budget", () => {
  it("reaches hard_stop once this month's global spend meets the configured monthly limit", async () => {
    process.env.DIAGNOSTIC_ENGINE_MONTHLY_BUDGET_USD = "20";
    seedRun("user-1", 25);
    const status = await computeDiagnosticEngineBudgetState("user-2", false);
    expect(status.state).toBe("hard_stop");
    expect(status.blockedScope).toBe("global_monthly");
  });
});

describe("computeDiagnosticEngineBudgetState — per-user budgets", () => {
  it("reaches hard_stop for a specific user's daily spend without affecting other users", async () => {
    process.env.DIAGNOSTIC_ENGINE_USER_DAILY_BUDGET_USD = "5";
    seedRun("user-1", 6);
    seedRun("user-2", 0.1);

    const blockedUser = await computeDiagnosticEngineBudgetState("user-1", false);
    expect(blockedUser.state).toBe("hard_stop");
    expect(blockedUser.blockedScope).toBe("user_daily");

    const okUser = await computeDiagnosticEngineBudgetState("user-2", false);
    expect(okUser.state).toBe("normal");
  });

  it("reaches hard_stop for a specific user's monthly spend", async () => {
    process.env.DIAGNOSTIC_ENGINE_USER_MONTHLY_BUDGET_USD = "15";
    seedRun("user-1", 20);
    const status = await computeDiagnosticEngineBudgetState("user-1", false);
    expect(status.state).toBe("hard_stop");
    expect(status.blockedScope).toBe("user_monthly");
  });
});

describe("computeDiagnosticEngineBudgetState — internal-tester budget", () => {
  it("internal testers are NOT unlimited by default once an internal daily budget is configured", async () => {
    process.env.DIAGNOSTIC_ENGINE_INTERNAL_DAILY_BUDGET_USD = "3";
    seedRun("tester-1", 5, { isInternal: true });
    const status = await computeDiagnosticEngineBudgetState("tester-1", true);
    expect(status.state).toBe("hard_stop");
    expect(status.blockedScope).toBe("internal_daily");
  });

  it("the internal-daily dimension is never evaluated for a non-internal caller", async () => {
    process.env.DIAGNOSTIC_ENGINE_INTERNAL_DAILY_BUDGET_USD = "1";
    seedRun("user-1", 50, { isInternal: false });
    const status = await computeDiagnosticEngineBudgetState("user-1", false);
    // Not internal, so internal_daily is skipped entirely — no other
    // dimension is configured, so this must stay normal despite $50 spent.
    expect(status.state).toBe("normal");
  });

  it("internal spend does not count against an ordinary global/user budget check for a different, non-internal user", async () => {
    process.env.DIAGNOSTIC_ENGINE_USER_DAILY_BUDGET_USD = "1000";
    seedRun("tester-1", 500, { isInternal: true });
    const status = await computeDiagnosticEngineBudgetState("user-2", false);
    expect(status.state).toBe("normal");
  });
});

describe("assertDiagnosticEngineBudgetAllows", () => {
  it("throws DiagnosticEngineBudgetExceededError only at hard_stop", () => {
    expect(() => assertDiagnosticEngineBudgetAllows({ state: "warning", reasons: [], blockedScope: null })).not.toThrow();
    expect(() => assertDiagnosticEngineBudgetAllows({ state: "restrict", reasons: [], blockedScope: null })).not.toThrow();
    expect(() =>
      assertDiagnosticEngineBudgetAllows({ state: "hard_stop", reasons: ["global_daily: $10.00/$10.00 (100%)"], blockedScope: "global_daily" }),
    ).toThrow(DiagnosticEngineBudgetExceededError);
  });

  it("the thrown error's message is the generic safe message, never the $ figures", () => {
    try {
      assertDiagnosticEngineBudgetAllows({ state: "hard_stop", reasons: ["global_daily: $999.99/$10.00 (9999%)"], blockedScope: "global_daily" });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(DiagnosticEngineBudgetExceededError);
      expect((err as Error).message).not.toContain("$999.99");
      expect((err as Error).message).toContain("temporarily unavailable");
    }
  });
});
