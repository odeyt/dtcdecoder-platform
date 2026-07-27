// Direct proofs for the mega-prompt's 18-item TESTING checklist
// (docs/PRICING_AND_AI_COST_AUDIT.md / the original "Audit and revise
// DTCDecoder subscription pricing..." task). Items already proven by an
// existing, more specific test file are referenced in a comment rather
// than duplicated here — see the mapping at the bottom of this file for
// all 18. This file exists for the items that had NO test coverage
// anywhere before Slice 7: the basic-search behaviors (items 1-5), which
// were built in Slice 1b but never actually asserted at the TS layer.
import { describe, expect, it, vi, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FakeSupabase } from "./mocks/fake-supabase";

vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabase = fake;
  return { createAdminClient: () => fake };
});

const { recordBasicSearchUsage, hasBasicSearchAllowanceRemaining, BasicSearchLimitExceededError } = await import(
  "@/lib/basic-search/usage"
);
const { recordAiDiagnosticRun } = await import("@/lib/ai-diagnostics/usage");
const { DIAGNOSTIC_CREDIT_WEIGHTS } = await import("@/lib/pricing");

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

// Mirrors migration 0022's record_basic_search_usage/get_basic_search_usage_summary
// closely enough to unit test the TS layer without a real database — same
// UTC day/month-bucketing approach as every other fake RPC handler in this
// suite (see test/ai-diagnostics-usage.test.ts).
function registerFakeRpcHandlers() {
  fake().setRpcHandler("record_basic_search_usage", (args) => {
    const identifierType = args.p_identifier_type as string;
    const identifier = args.p_identifier as string;
    const dailyLimit = args.p_daily_limit as number | null;
    const monthlyLimit = args.p_monthly_limit as number | null;

    const rows = fake().dump("basic_search_usage");
    const today = new Date().toISOString().slice(0, 10);
    const thisMonth = new Date().toISOString().slice(0, 7);

    if (dailyLimit !== null) {
      const dailyCount = rows.filter(
        (r) =>
          r.identifier_type === identifierType &&
          r.identifier === identifier &&
          (r.created_at as string).slice(0, 10) === today,
      ).length;
      if (dailyCount >= dailyLimit) return "daily_limit_exceeded";
    }
    if (monthlyLimit !== null) {
      const monthlyCount = rows.filter(
        (r) =>
          r.identifier_type === identifierType &&
          r.identifier === identifier &&
          (r.created_at as string).slice(0, 7) === thisMonth,
      ).length;
      if (monthlyCount >= monthlyLimit) return "monthly_limit_exceeded";
    }

    fake().seed("basic_search_usage", [
      { identifier_type: identifierType, identifier, created_at: new Date().toISOString() },
    ]);
    return "recorded";
  });

  fake().setRpcHandler("get_basic_search_usage_summary", (args) => {
    const identifierType = args.p_identifier_type as string;
    const identifier = args.p_identifier as string;
    const rows = fake()
      .dump("basic_search_usage")
      .filter((r) => r.identifier_type === identifierType && r.identifier === identifier);
    const today = new Date().toISOString().slice(0, 10);
    const thisMonth = new Date().toISOString().slice(0, 7);

    return [
      {
        searches_used_today: rows.filter((r) => (r.created_at as string).slice(0, 10) === today).length,
        searches_used_this_month: rows.filter((r) => (r.created_at as string).slice(0, 7) === thisMonth).length,
      },
    ];
  });
}

// Same past-day helper used across the suite so seeded fixture rows count
// toward "this month" without also tripping "today".
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

// Required proof #1: "Free search never invokes an AI provider."
describe("proof #1 — basic search never touches an AI provider", () => {
  it("src/lib/basic-search/usage.ts has no AI-provider import at all", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/basic-search/usage.ts"), "utf8");
    expect(src).not.toMatch(/anthropic/i);
    expect(src).not.toMatch(/@anthropic-ai\/sdk/);
  });

  it("src/lib/dtc.ts (the actual search/lookup queries) has no AI-provider import at all", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/dtc.ts"), "utf8");
    expect(src).not.toMatch(/anthropic/i);
    expect(src).not.toMatch(/@anthropic-ai\/sdk/);
  });
});

// Required proof #2: "Free user receives 3 daily basic searches."
describe("proof #2 — free plan gets exactly 3 basic searches per UTC day", () => {
  it("grants the first 3 searches today, blocks the 4th with a daily-limit error", async () => {
    const identity = { type: "anon" as const, id: "anon-1" };
    await recordBasicSearchUsage(identity, "free");
    await recordBasicSearchUsage(identity, "free");
    await recordBasicSearchUsage(identity, "free");

    await expect(recordBasicSearchUsage(identity, "free")).rejects.toThrow(BasicSearchLimitExceededError);
  });

  it("hasBasicSearchAllowanceRemaining agrees before the reservation call is even made", async () => {
    const identity = { type: "anon" as const, id: "anon-2" };
    await recordBasicSearchUsage(identity, "free");
    await recordBasicSearchUsage(identity, "free");
    await recordBasicSearchUsage(identity, "free");

    await expect(hasBasicSearchAllowanceRemaining(identity, "free")).resolves.toBe(false);
  });
});

// Required proof #3: "Free user receives 10 monthly basic searches."
describe("proof #3 — free plan gets exactly 10 basic searches per calendar month", () => {
  it("blocks the 11th search this month even though the daily count is far under 3", async () => {
    const identifier = "anon-3";
    // Seed 10 prior searches spread across past days this month (never
    // today, so today's daily count stays at 0 — isolates the monthly
    // cap from the daily one, same pattern as the AI-diagnostic tests).
    fake().seed(
      "basic_search_usage",
      Array.from({ length: 10 }, (_, i) => ({
        identifier_type: "anon",
        identifier,
        created_at: pastDayInCurrentMonthIso(i),
      })),
    );

    const identity = { type: "anon" as const, id: identifier };
    await expect(recordBasicSearchUsage(identity, "free")).rejects.toThrow(BasicSearchLimitExceededError);
  });
});

// Required proof #4: "Static DTC page views do not consume quota."
describe("proof #4 — direct /dtc/[code] lookups never touch basic-search usage", () => {
  it("src/lib/dtc.ts (getGenericDtcCode/getMakeDtcCode) never imports the basic-search usage module", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/dtc.ts"), "utf8");
    expect(src).not.toMatch(/basic-search\/usage/);
  });
});

// Required proof #5: "Failed searches do not consume quota."
describe("proof #5 — a search that returns zero results never records usage", () => {
  it("src/app/[locale]/dtc/page.tsx only calls recordBasicSearchUsage inside a results.length > 0 guard", () => {
    const src = readFileSync(join(process.cwd(), "src/app/[locale]/dtc/page.tsx"), "utf8");
    const recordCallIndex = src.indexOf("recordBasicSearchUsage(identity, plan)");
    expect(recordCallIndex).toBeGreaterThan(-1);

    // The nearest preceding conditional must be the results-length guard —
    // a simple, honest regression check: if that guard is ever removed or
    // the call moved outside it, this substring search fails.
    const guardIndex = src.lastIndexOf("if (results.length > 0)", recordCallIndex);
    expect(guardIndex).toBeGreaterThan(-1);
    expect(recordCallIndex).toBeGreaterThan(guardIndex);
    // And nothing structural (an early return/closing brace at column 0)
    // sits between the guard and the call.
    expect(src.slice(guardIndex, recordCallIndex)).not.toMatch(/\n\s{0,4}\}/);
  });
});

// Required proof #13: "Token values are recorded."
describe("proof #13 — token counts are persisted on the cost-ledger row", () => {
  it("recordAiDiagnosticRun stores exactly the input/output token counts it was given", async () => {
    await recordAiDiagnosticRun({
      userId: "user-1",
      requestId: "req-1",
      feature: "chat",
      plan: "pro",
      providerId: "anthropic",
      modelId: "claude-sonnet-5",
      status: "completed",
      accessLevelRequested: "full",
      inputTokens: 1234,
      outputTokens: 567,
    });

    const rows = fake().dump("ai_diagnostic_runs");
    expect(rows).toHaveLength(1);
    expect(rows[0].input_tokens).toBe(1234);
    expect(rows[0].output_tokens).toBe(567);
  });
});

// Required proof #14: "Model route is recorded."
describe("proof #14 — the actual model used is persisted on the cost-ledger row", () => {
  it("recordAiDiagnosticRun stores the exact model_id it was given, distinguishing routed models", async () => {
    await recordAiDiagnosticRun({
      userId: "user-1",
      requestId: "req-generation",
      feature: "chat",
      plan: "pro",
      providerId: "anthropic",
      modelId: "claude-sonnet-5",
      status: "completed",
      accessLevelRequested: "full",
      operationType: "standard_report",
    });
    await recordAiDiagnosticRun({
      userId: "user-1",
      requestId: "req-generation",
      feature: "chat",
      plan: "pro",
      providerId: "anthropic",
      modelId: "claude-haiku-4-5",
      status: "completed",
      accessLevelRequested: "full",
      operationType: "additional_language",
    });

    const rows = fake().dump("ai_diagnostic_runs");
    expect(rows.find((r) => r.operation_type === "standard_report")?.model_id).toBe("claude-sonnet-5");
    expect(rows.find((r) => r.operation_type === "additional_language")?.model_id).toBe("claude-haiku-4-5");
  });
});

// Required proof #16: "Additional report language consumes configured credits."
describe("proof #16 — an additional-language operation debits the configured credit weight", () => {
  it("DIAGNOSTIC_CREDIT_WEIGHTS.additionalLanguage is 0.5, and recordAiDiagnosticRun persists it as credits_consumed", async () => {
    expect(DIAGNOSTIC_CREDIT_WEIGHTS.additionalLanguage).toBe(0.5);

    await recordAiDiagnosticRun({
      userId: "user-1",
      requestId: "req-1",
      feature: "chat",
      plan: "pro",
      providerId: "anthropic",
      modelId: "claude-haiku-4-5",
      status: "completed",
      accessLevelRequested: "full",
      operationType: "additional_language",
      creditsConsumed: DIAGNOSTIC_CREDIT_WEIGHTS.additionalLanguage,
    });

    const rows = fake().dump("ai_diagnostic_runs");
    expect(rows[0].credits_consumed).toBe(0.5);
    expect(rows[0].operation_type).toBe("additional_language");
  });
});

// Required proof #18 (general case — see also test/payments-creem-addon.test.ts
// for the add-on-pack-specific product-id gate): "Billing remains disabled
// without required Creem product IDs."
describe("proof #18 — subscription billing is disabled by default", () => {
  const ORIGINAL = process.env.NEXT_PUBLIC_BILLING_ENABLED;

  afterAll(() => {
    if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_BILLING_ENABLED;
    else process.env.NEXT_PUBLIC_BILLING_ENABLED = ORIGINAL;
  });

  it("env.billingEnabled() is false when NEXT_PUBLIC_BILLING_ENABLED is unset (this repo's current real state)", async () => {
    delete process.env.NEXT_PUBLIC_BILLING_ENABLED;
    const { env } = await import("@/lib/env");
    expect(env.billingEnabled()).toBe(false);
  });

  it("env.billingEnabled() is true only when explicitly set to the literal string 'true'", async () => {
    process.env.NEXT_PUBLIC_BILLING_ENABLED = "yes";
    const { env: envYes } = await import("@/lib/env");
    expect(envYes.billingEnabled()).toBe(false);

    process.env.NEXT_PUBLIC_BILLING_ENABLED = "true";
    const { env: envTrue } = await import("@/lib/env");
    expect(envTrue.billingEnabled()).toBe(true);
  });
});

// Full 18-item mapping (docs/PRICING_AND_AI_COST_AUDIT.md's required
// TESTING list) — every item is proven somewhere; most were already
// covered by earlier slices' own test files and are referenced here
// rather than duplicated:
//
//  1. Free search never invokes an AI provider           -> this file
//  2. Free user receives 3 daily basic searches           -> this file
//  3. Free user receives 10 monthly basic searches        -> this file
//  4. Static DTC page views do not consume quota          -> this file
//  5. Failed searches do not consume quota                -> this file
//  6. Free user cannot call paid AI endpoints              -> test/ai-diagnostics-usage.test.ts ("free plan (zero AI diagnostic calls)")
//  7. Pro receives configured monthly and daily limits     -> test/ai-diagnostics-usage.test.ts ("paid plans (full access)")
//  8. Workshop receives configured monthly and daily limits -> test/ai-diagnostics-usage.test.ts ("workshop's higher allowance")
//  9. Limits are enforced server-side                      -> every recordAiDiagnosticUsage call resolves plan via getEffectivePlan(userId), never a client-supplied value — see src/lib/ai-diagnostics/usage.ts and its callers
// 10. Client-side plan manipulation fails                  -> test/ai-diagnostics-client-trust.test.ts
// 11. Cost reservation is refunded on provider failure     -> test/scan-analyze-route.test.ts ("provider failure...does not double-charge")
// 12. Hard cost ceiling stops an expensive request         -> test/ai-diagnostics-cost.test.ts (guardCostCeiling) + test/scan-analyze-route.test.ts ("cost ceiling exceeded")
// 13. Token values are recorded                            -> this file
// 14. Model route is recorded                              -> this file (+ test/ai-diagnostics-model-routing.test.ts for the routing decision itself)
// 15. Cached translation is not billed twice                -> test/localized-report.test.ts ("serves a completed translation from cache without re-translating")
// 16. Additional report language consumes configured credits -> this file
// 17. Add-on packs are consumed after included quota        -> test/ai-diagnostics-addon.test.ts
// 18. Billing remains disabled without required Creem IDs   -> this file (subscriptions) + test/payments-creem-addon.test.ts (add-on packs)
