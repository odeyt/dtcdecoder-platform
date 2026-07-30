import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";

vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabase = fake;
  return { createAdminClient: () => fake };
});

const {
  grantSingleReportPurchase,
  redeemSingleReportPurchase,
  getActiveSingleReportUnlock,
  consumeReportFollowUp,
  consumeReportRegeneration,
  getReportUsageStatus,
  getUnusedSingleReportPurchaseCount,
} = await import("@/lib/ai-diagnostics/single-report-purchases");

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

// Mirrors migration 0037's grant_single_report_purchase() and
// redeem_single_report_purchase() closely enough to unit test the TS
// layer without a real database — same approach as
// test/ai-diagnostics-addon.test.ts.
function registerFakeRpcHandlers() {
  fake().setRpcHandler("grant_single_report_purchase", (args) => {
    const userId = args.p_user_id as string;
    const creemOrderId = args.p_creem_order_id as string;

    const already = fake()
      .dump("single_report_purchases")
      .some((r) => r.creem_order_id === creemOrderId);
    if (already) return null;

    fake().seed("single_report_purchases", [
      {
        user_id: userId,
        status: "unused",
        case_id: null,
        creem_order_id: creemOrderId,
        purchased_at: new Date().toISOString(),
        consumed_at: null,
        expires_at: null,
      },
    ]);
    return null;
  });

  fake().setRpcHandler("redeem_single_report_purchase", (args) => {
    const userId = args.p_user_id as string;
    const caseId = args.p_case_id as string;

    const unused = fake()
      .dump("single_report_purchases")
      .filter((r) => r.user_id === userId && r.status === "unused")
      .sort((a, b) => String(a.purchased_at).localeCompare(String(b.purchased_at)));
    const oldest = unused[0];
    if (!oldest) return false;

    oldest.status = "consumed";
    oldest.case_id = caseId;
    oldest.consumed_at = new Date().toISOString();
    oldest.expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    oldest.followup_count = 0;
    oldest.regeneration_count = 0;
    return true;
  });

  // Mirrors migration 0043's consume_report_followup/consume_report_regeneration
  // — a single atomic "increment only while under the max" update, same
  // shape as the real SQL's UPDATE ... WHERE ... RETURNING.
  fake().setRpcHandler("consume_report_followup", (args) => {
    const caseId = args.p_case_id as string;
    const max = args.p_max_followups as number;
    const row = fake()
      .dump("single_report_purchases")
      .find((r) => r.case_id === caseId && r.status === "consumed");
    if (!row) return false;
    const current = (row.followup_count as number) ?? 0;
    if (current >= max) return false;
    row.followup_count = current + 1;
    return true;
  });

  fake().setRpcHandler("consume_report_regeneration", (args) => {
    const caseId = args.p_case_id as string;
    const max = args.p_max_regenerations as number;
    const row = fake()
      .dump("single_report_purchases")
      .find((r) => r.case_id === caseId && r.status === "consumed");
    if (!row) return false;
    const current = (row.regeneration_count as number) ?? 0;
    if (current >= max) return false;
    row.regeneration_count = current + 1;
    return true;
  });
}

beforeEach(() => {
  fake().reset();
  registerFakeRpcHandlers();
});

describe("grantSingleReportPurchase", () => {
  it("grants an unused purchase", async () => {
    await grantSingleReportPurchase({ userId: "user-1", creemOrderId: "order-1" });

    const rows = fake().dump("single_report_purchases");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: "user-1", status: "unused", case_id: null });
  });

  it("is idempotent on creemOrderId — a webhook retry never grants twice", async () => {
    await grantSingleReportPurchase({ userId: "user-1", creemOrderId: "order-1" });
    await grantSingleReportPurchase({ userId: "user-1", creemOrderId: "order-1" });

    expect(fake().dump("single_report_purchases")).toHaveLength(1);
  });
});

describe("redeemSingleReportPurchase", () => {
  it("claims the oldest unused purchase for this case and sets a 30-day expiry", async () => {
    await grantSingleReportPurchase({ userId: "user-1", creemOrderId: "order-1" });

    const redeemed = await redeemSingleReportPurchase({ userId: "user-1", caseId: "case-1" });
    expect(redeemed).toBe(true);

    const row = fake().dump("single_report_purchases")[0];
    expect(row.status).toBe("consumed");
    expect(row.case_id).toBe("case-1");
    expect(row.consumed_at).toBeTruthy();

    const daysUntilExpiry = (new Date(row.expires_at as string).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(daysUntilExpiry).toBeGreaterThan(29);
    expect(daysUntilExpiry).toBeLessThanOrEqual(30);
  });

  it("returns false — not an error — when the user has no unused purchase", async () => {
    const redeemed = await redeemSingleReportPurchase({ userId: "user-with-none", caseId: "case-1" });
    expect(redeemed).toBe(false);
  });

  it("a purchase can only ever be redeemed once — a second attempt finds nothing left", async () => {
    await grantSingleReportPurchase({ userId: "user-1", creemOrderId: "order-1" });

    await redeemSingleReportPurchase({ userId: "user-1", caseId: "case-1" });
    const secondAttempt = await redeemSingleReportPurchase({ userId: "user-1", caseId: "case-2" });

    expect(secondAttempt).toBe(false);
    // The first case's redemption is untouched by the failed second attempt.
    expect(fake().dump("single_report_purchases")[0].case_id).toBe("case-1");
  });
});

describe("getActiveSingleReportUnlock", () => {
  it("returns the unlock for a consumed, unexpired purchase", async () => {
    await grantSingleReportPurchase({ userId: "user-1", creemOrderId: "order-1" });
    await redeemSingleReportPurchase({ userId: "user-1", caseId: "case-1" });

    const unlock = await getActiveSingleReportUnlock("case-1");
    expect(unlock).not.toBeNull();
    expect(new Date(unlock!.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("returns null once expires_at has passed — view access reverts to locked, nothing is deleted", async () => {
    await grantSingleReportPurchase({ userId: "user-1", creemOrderId: "order-1" });
    await redeemSingleReportPurchase({ userId: "user-1", caseId: "case-1" });

    // Simulate the 30-day window having already elapsed.
    fake().dump("single_report_purchases")[0].expires_at = new Date(Date.now() - 1000).toISOString();

    const unlock = await getActiveSingleReportUnlock("case-1");
    expect(unlock).toBeNull();
    // The row itself still exists — expiry locks view access, it never deletes the purchase record.
    expect(fake().dump("single_report_purchases")).toHaveLength(1);
  });

  it("returns null for a case with no purchase at all", async () => {
    const unlock = await getActiveSingleReportUnlock("case-never-purchased");
    expect(unlock).toBeNull();
  });
});

describe("consumeReportFollowUp", () => {
  it("allows up to 5 follow-ups, then blocks the 6th", async () => {
    await grantSingleReportPurchase({ userId: "user-1", creemOrderId: "order-1" });
    await redeemSingleReportPurchase({ userId: "user-1", caseId: "case-1" });

    for (let i = 0; i < 5; i++) {
      expect(await consumeReportFollowUp("case-1")).toBe(true);
    }
    expect(await consumeReportFollowUp("case-1")).toBe(false);

    // The 6th (blocked) attempt never incremented the counter past 5.
    expect(fake().dump("single_report_purchases")[0].followup_count).toBe(5);
  });

  it("returns false for a case with no active purchase unlock", async () => {
    expect(await consumeReportFollowUp("case-never-purchased")).toBe(false);
  });
});

describe("consumeReportRegeneration", () => {
  it("allows exactly 1 regeneration, then blocks the 2nd", async () => {
    await grantSingleReportPurchase({ userId: "user-1", creemOrderId: "order-1" });
    await redeemSingleReportPurchase({ userId: "user-1", caseId: "case-1" });

    expect(await consumeReportRegeneration("case-1")).toBe(true);
    expect(await consumeReportRegeneration("case-1")).toBe(false);
    expect(fake().dump("single_report_purchases")[0].regeneration_count).toBe(1);
  });

  it("returns false for a case with no active purchase unlock", async () => {
    expect(await consumeReportRegeneration("case-never-purchased")).toBe(false);
  });
});

describe("getReportUsageStatus", () => {
  it("reports used/max counts for an unlocked case", async () => {
    await grantSingleReportPurchase({ userId: "user-1", creemOrderId: "order-1" });
    await redeemSingleReportPurchase({ userId: "user-1", caseId: "case-1" });
    await consumeReportFollowUp("case-1");
    await consumeReportFollowUp("case-1");
    await consumeReportRegeneration("case-1");

    const status = await getReportUsageStatus("case-1");
    expect(status).toEqual({
      followUpsUsed: 2,
      followUpsMax: 5,
      regenerationsUsed: 1,
      regenerationsMax: 1,
    });
  });

  it("returns null for a case with no active purchase unlock", async () => {
    expect(await getReportUsageStatus("case-never-purchased")).toBeNull();
  });
});

describe("getUnusedSingleReportPurchaseCount", () => {
  it("counts only unused purchases for the given user", async () => {
    await grantSingleReportPurchase({ userId: "user-1", creemOrderId: "order-1" });
    await grantSingleReportPurchase({ userId: "user-1", creemOrderId: "order-2" });
    await grantSingleReportPurchase({ userId: "user-2", creemOrderId: "order-3" });
    await redeemSingleReportPurchase({ userId: "user-1", caseId: "case-1" });

    expect(await getUnusedSingleReportPurchaseCount("user-1")).toBe(1);
    expect(await getUnusedSingleReportPurchaseCount("user-2")).toBe(1);
    expect(await getUnusedSingleReportPurchaseCount("user-nobody")).toBe(0);
  });
});
