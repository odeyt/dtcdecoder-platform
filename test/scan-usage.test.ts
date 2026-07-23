import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";

// Mirrors the real consume_scan_usage_slot/get_monthly_scan_usage RPC
// semantics (supabase/migrations/0013_scan_diagnostics_ai_and_usage.sql)
// closely enough to exercise the idempotency/limit behavior without a real
// database: a ledger of consumed case IDs per user, not an incrementing
// counter — re-consuming for the same case is always a no-op success.
vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabase = fake;
  return { createAdminClient: () => fake };
});

const { consumeScanUsageSlot, getScanUsageSummary } = await import("@/lib/scan-diagnostics/usage");
const { ScanUsageLimitExceededError } = await import("@/lib/scan-diagnostics/api-errors");

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

beforeEach(() => {
  fake().reset();
  // reset() clears registered RPC handlers too, so they're re-registered
  // fresh (against a fresh ledger map) before every test.
  const consumedByUser = new Map<string, Set<string>>();
  fake().setRpcHandler("consume_scan_usage_slot", (args) => {
    const userId = args.p_user_id as string;
    const caseId = args.p_case_id as string;
    const limit = args.p_limit as number;
    const consumed = consumedByUser.get(userId) ?? new Set<string>();
    consumedByUser.set(userId, consumed);
    if (consumed.has(caseId)) return true;
    if (consumed.size >= limit) return false;
    consumed.add(caseId);
    return true;
  });
  fake().setRpcHandler("get_monthly_scan_usage", (args) => {
    const userId = args.p_user_id as string;
    return consumedByUser.get(userId)?.size ?? 0;
  });
});

describe("consumeScanUsageSlot", () => {
  it("consumes a slot for a new case", async () => {
    await consumeScanUsageSlot("user-1", "case-1", "free");
    const summary = await getScanUsageSummary("user-1", "free");
    expect(summary.used).toBe(1);
    expect(summary.limit).toBe(2);
  });

  it("retrying for the SAME case is a no-op success, not a second charge", async () => {
    await consumeScanUsageSlot("user-1", "case-1", "free");
    await consumeScanUsageSlot("user-1", "case-1", "free"); // simulated retry after provider failure
    const summary = await getScanUsageSummary("user-1", "free");
    expect(summary.used).toBe(1);
  });

  it("throws once the plan's monthly limit is reached for a NEW case", async () => {
    await consumeScanUsageSlot("user-1", "case-1", "free");
    await consumeScanUsageSlot("user-1", "case-2", "free"); // free limit is 2
    await expect(consumeScanUsageSlot("user-1", "case-3", "free")).rejects.toBeInstanceOf(
      ScanUsageLimitExceededError,
    );
  });

  it("does not throw for a retry on an already-consumed case even after the limit is reached", async () => {
    await consumeScanUsageSlot("user-1", "case-1", "free");
    await consumeScanUsageSlot("user-1", "case-2", "free");
    await expect(consumeScanUsageSlot("user-1", "case-1", "free")).resolves.toBeUndefined();
  });

  it("tracks usage independently per user", async () => {
    await consumeScanUsageSlot("user-1", "case-1", "free");
    await consumeScanUsageSlot("user-2", "case-2", "free");
    expect((await getScanUsageSummary("user-1", "free")).used).toBe(1);
    expect((await getScanUsageSummary("user-2", "free")).used).toBe(1);
  });
});
