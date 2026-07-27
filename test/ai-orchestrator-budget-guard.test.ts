import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";

vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabaseBudget = fake;
  return { createAdminClient: () => fake };
});

const { computeBudgetState, assertBudgetAllowsGeneration, BudgetHardStopError } = await import(
  "@/lib/ai-diagnostics/budget-guard"
);

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabaseBudget as FakeSupabase;
}

function seedRun(userId: string, costMicros: number, createdAt = new Date().toISOString()) {
  fake().seed("ai_diagnostic_runs", [
    { user_id: userId, estimated_total_cost_micros: costMicros, created_at: createdAt },
  ]);
}

const ENV_KEYS = ["AI_DAILY_BUDGET_USD", "AI_MONTHLY_BUDGET_USD", "AI_PER_USER_DAILY_BUDGET_USD", "AI_PER_SHOP_MONTHLY_BUDGET_USD"] as const;
const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  fake().reset();
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe("computeBudgetState", () => {
  it("is 'normal' when no budget dimension is configured, regardless of real spend", () => {
    seedRun("user-1", 5_000_000_000);
    return computeBudgetState("user-1").then((status) => {
      expect(status.state).toBe("normal");
      expect(status.reasons).toHaveLength(0);
    });
  });

  it("is 'warning' at 75-89% of a configured per-user daily budget", async () => {
    process.env.AI_PER_USER_DAILY_BUDGET_USD = "1";
    seedRun("user-1", 800_000); // $0.80 of $1.00 = 80%
    const status = await computeBudgetState("user-1");
    expect(status.state).toBe("warning");
  });

  it("is 'restrict' at 90-99% of a configured budget", async () => {
    process.env.AI_PER_USER_DAILY_BUDGET_USD = "1";
    seedRun("user-1", 950_000);
    const status = await computeBudgetState("user-1");
    expect(status.state).toBe("restrict");
  });

  it("is 'hard_stop' at or over 100% of a configured budget", async () => {
    process.env.AI_PER_USER_DAILY_BUDGET_USD = "1";
    seedRun("user-1", 1_000_000);
    const status = await computeBudgetState("user-1");
    expect(status.state).toBe("hard_stop");
  });

  it("owner-wide daily budget counts spend across every user, not just the one requesting", async () => {
    process.env.AI_DAILY_BUDGET_USD = "1";
    seedRun("user-1", 600_000);
    seedRun("user-2", 600_000);
    const status = await computeBudgetState("user-1");
    expect(status.state).toBe("hard_stop"); // 1.2M / 1.0M = 120%
  });

  it("per-shop monthly is evaluated as an alias of this user's own monthly spend (no shop entity exists)", async () => {
    process.env.AI_PER_SHOP_MONTHLY_BUDGET_USD = "1";
    seedRun("user-1", 1_000_000, new Date().toISOString());
    const status = await computeBudgetState("user-1");
    expect(status.state).toBe("hard_stop");
  });
});

describe("assertBudgetAllowsGeneration", () => {
  it("does not throw for normal/warning/restrict states", () => {
    expect(() => assertBudgetAllowsGeneration({ state: "normal", reasons: [] })).not.toThrow();
    expect(() => assertBudgetAllowsGeneration({ state: "warning", reasons: [] })).not.toThrow();
    expect(() => assertBudgetAllowsGeneration({ state: "restrict", reasons: [] })).not.toThrow();
  });

  it("throws BudgetHardStopError only at hard_stop", () => {
    expect(() => assertBudgetAllowsGeneration({ state: "hard_stop", reasons: ["Owner daily budget: over"] })).toThrow(
      BudgetHardStopError,
    );
  });
});
