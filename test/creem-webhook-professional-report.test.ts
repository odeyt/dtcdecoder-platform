import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";
import { NextRequest } from "next/server";
import type { FakeSupabase } from "./mocks/fake-supabase";

vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabase = fake;
  return { createAdminClient: () => fake };
});

// Forces the mock factory above to resolve before any test body runs — see
// the same top-level-await pattern in test/single-report-purchases.test.ts.
const { POST } = await import("@/app/api/webhooks/creem/route");

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

const WEBHOOK_SECRET = "test-webhook-secret";
const PRODUCT_ID = "prod_professional_report_test";

const ORIGINAL_ENV = {
  CREEM_WEBHOOK_SECRET: process.env.CREEM_WEBHOOK_SECRET,
  CREEM_PROFESSIONAL_REPORT_PRODUCT_ID: process.env.CREEM_PROFESSIONAL_REPORT_PRODUCT_ID,
};

beforeEach(() => {
  process.env.CREEM_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.CREEM_PROFESSIONAL_REPORT_PRODUCT_ID = PRODUCT_ID;
  fake().reset();
  // Mirrors migration 0037's grant_single_report_purchase — idempotent on
  // creem_order_id, matching test/single-report-purchases.test.ts.
  fake().setRpcHandler("grant_single_report_purchase", (args) => {
    const userId = args.p_user_id as string;
    const creemOrderId = args.p_creem_order_id as string;
    const already = fake()
      .dump("single_report_purchases")
      .some((r) => r.creem_order_id === creemOrderId);
    if (already) return null;
    fake().seed("single_report_purchases", [
      { user_id: userId, status: "unused", case_id: null, creem_order_id: creemOrderId },
    ]);
    return null;
  });
});

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function signedRequest(body: unknown) {
  const rawBody = JSON.stringify(body);
  const signature = crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");
  return new NextRequest("https://dtcdecoder.com/api/webhooks/creem", {
    method: "POST",
    headers: { "creem-signature": signature, "content-type": "application/json" },
    body: rawBody,
  });
}

function checkoutCompletedEvent(overrides: { productId?: string; userId?: string | null; productKey?: string | null; id?: string } = {}) {
  return {
    id: overrides.id ?? "evt_1",
    eventType: "checkout.completed",
    object: {
      id: overrides.id ?? "order_1",
      product_id: overrides.productId ?? PRODUCT_ID,
      metadata: {
        ...(overrides.productKey !== null ? { product_key: overrides.productKey ?? "professional_report_one_time" } : {}),
        ...(overrides.userId ? { user_id: overrides.userId } : {}),
      },
    },
  };
}

describe("POST /api/webhooks/creem — professional report purchase", () => {
  it("rejects an invalid signature before touching anything", async () => {
    const rawBody = JSON.stringify(checkoutCompletedEvent({ userId: "user-1" }));
    const request = new NextRequest("https://dtcdecoder.com/api/webhooks/creem", {
      method: "POST",
      headers: { "creem-signature": "0".repeat(64), "content-type": "application/json" },
      body: rawBody,
    });

    const res = await POST(request);
    expect(res.status).toBe(401);
    expect(fake().dump("single_report_purchases")).toHaveLength(0);
  });

  it("grants a credit for a valid checkout.completed event with matching product id + product_key", async () => {
    const res = await POST(signedRequest(checkoutCompletedEvent({ userId: "user-1" })));

    expect(res.status).toBe(200);
    const rows = fake().dump("single_report_purchases");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: "user-1", status: "unused" });
  });

  it("is idempotent — a duplicate webhook delivery for the same order grants only one credit", async () => {
    const event = checkoutCompletedEvent({ userId: "user-1", id: "order-dup" });

    await POST(signedRequest(event));
    await POST(signedRequest({ ...event, id: "evt_2" })); // same order id, different event id (a real retry)

    expect(fake().dump("single_report_purchases")).toHaveLength(1);
  });

  it("acknowledges but grants nothing when user_id metadata is missing", async () => {
    const res = await POST(signedRequest(checkoutCompletedEvent({ userId: null })));

    expect(res.status).toBe(200);
    expect(fake().dump("single_report_purchases")).toHaveLength(0);
  });

  it("grants nothing when metadata.product_key doesn't match, even if the product id matches", async () => {
    const res = await POST(
      signedRequest(checkoutCompletedEvent({ userId: "user-1", productKey: "some_other_product" })),
    );

    expect(res.status).toBe(200);
    expect(fake().dump("single_report_purchases")).toHaveLength(0);
  });

  it("does not treat an unrelated product's checkout.completed event as a professional-report purchase", async () => {
    const res = await POST(
      signedRequest(checkoutCompletedEvent({ userId: "user-1", productId: "prod_unrelated", productKey: null })),
    );

    expect(res.status).toBe(200);
    expect(fake().dump("single_report_purchases")).toHaveLength(0);
  });
});
