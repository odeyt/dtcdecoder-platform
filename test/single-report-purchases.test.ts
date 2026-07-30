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
