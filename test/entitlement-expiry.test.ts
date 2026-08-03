import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";

// getEffectivePlan filtered on status='active' alone and never looked at
// current_period_end, so a subscription whose billing period had ended kept
// granting full paid entitlement indefinitely.
//
// Nothing could expire it. Only the Creem webhook writes 'canceled', so a
// row the webhook cannot reach — no creem_subscription_id, or a cancellation
// event that was never delivered — stays 'active' forever. Production had a
// Pro row whose period ended 2026-08-01 still resolving to `pro` on
// 2026-08-03. Unlike the MRR version of this bug (PR #27), this one gave
// away the paid product, not just a wrong number on a dashboard.

vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabase = fake;
  return { createAdminClient: () => fake };
});

const { getEffectivePlan } = await import("@/lib/subscriptions");

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

const USER = "user-1";
const EMAIL = "buyer@example.com";
const future = new Date(Date.now() + 20 * 864e5).toISOString();
const farFuture = new Date(Date.now() + 60 * 864e5).toISOString();
const past = new Date(Date.now() - 2 * 864e5).toISOString();

const sub = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  user_id: USER,
  email: EMAIL,
  plan: "pro",
  status: "active",
  current_period_end: future,
  ...over,
});

beforeEach(() => fake().reset());

describe("getEffectivePlan — a lapsed period no longer grants entitlement", () => {
  it("drops a lapsed subscription to free", async () => {
    fake().seed("subscriptions", [sub({ plan: "pro", current_period_end: past })]);
    await expect(getEffectivePlan(USER, EMAIL)).resolves.toBe("free");
  });

  it("still grants a subscription whose period is in the future", async () => {
    fake().seed("subscriptions", [sub({ plan: "workshop", current_period_end: future })]);
    await expect(getEffectivePlan(USER, EMAIL)).resolves.toBe("workshop");
  });

  it("still grants when there is no period end, rather than revoking a payer", async () => {
    // upsertSubscriptionFromWebhook writes `current_period_end ?? null`, so a
    // real paid subscription can arrive without one. Revoking those would be
    // strictly worse than the bug being fixed.
    fake().seed("subscriptions", [sub({ plan: "pro", current_period_end: null })]);
    await expect(getEffectivePlan(USER, EMAIL)).resolves.toBe("pro");
  });

  it("still grants when the period end is unparseable", async () => {
    fake().seed("subscriptions", [sub({ plan: "pro", current_period_end: "not-a-date" })]);
    await expect(getEffectivePlan(USER, EMAIL)).resolves.toBe("pro");
  });

  it("does not let a lapsed row mask a valid undated one", async () => {
    // The old query ordered by current_period_end desc nulls last and took
    // limit(1) — the lapsed Pro row sorted first and won. Ranking cannot be
    // decided before expiry is applied.
    fake().seed("subscriptions", [
      { ...sub({ id: "s1", plan: "pro", current_period_end: past }) },
      { ...sub({ id: "s2", plan: "workshop", current_period_end: null }) },
    ]);
    await expect(getEffectivePlan(USER, EMAIL)).resolves.toBe("workshop");
  });

  it("picks the furthest-future period when several are valid", async () => {
    fake().seed("subscriptions", [
      { ...sub({ id: "s1", plan: "pro", current_period_end: future }) },
      { ...sub({ id: "s2", plan: "workshop", current_period_end: farFuture }) },
    ]);
    await expect(getEffectivePlan(USER, EMAIL)).resolves.toBe("workshop");
  });

  it("prefers a dated valid row over an undated one", async () => {
    fake().seed("subscriptions", [
      { ...sub({ id: "s1", plan: "pro", current_period_end: null }) },
      { ...sub({ id: "s2", plan: "workshop", current_period_end: future }) },
    ]);
    await expect(getEffectivePlan(USER, EMAIL)).resolves.toBe("workshop");
  });
});

describe("getEffectivePlan — the email fallback applies the same expiry rule", () => {
  it("does not grant entitlement from a lapsed row matched by email", async () => {
    fake().seed("subscriptions", [
      sub({ user_id: null, plan: "workshop", current_period_end: past }),
    ]);
    await expect(getEffectivePlan("different-user", EMAIL)).resolves.toBe("free");
  });

  it("still grants from a valid row matched by email", async () => {
    fake().seed("subscriptions", [
      sub({ user_id: null, plan: "workshop", current_period_end: future }),
    ]);
    await expect(getEffectivePlan("different-user", EMAIL)).resolves.toBe("workshop");
  });

  it("falls through to the email match when the user_id row has lapsed", async () => {
    fake().seed("subscriptions", [
      sub({ id: "s1", user_id: USER, email: "other@example.com", plan: "pro", current_period_end: past }),
      sub({ id: "s2", user_id: null, email: EMAIL, plan: "workshop", current_period_end: future }),
    ]);
    await expect(getEffectivePlan(USER, EMAIL)).resolves.toBe("workshop");
  });
});

describe("getEffectivePlan — unchanged behaviour", () => {
  it("ignores canceled and past_due regardless of period", async () => {
    fake().seed("subscriptions", [
      sub({ id: "s1", plan: "pro", status: "canceled", current_period_end: farFuture }),
      sub({ id: "s2", plan: "workshop", status: "past_due", current_period_end: farFuture }),
    ]);
    await expect(getEffectivePlan(USER, EMAIL)).resolves.toBe("free");
  });

  it("is free with no rows at all", async () => {
    await expect(getEffectivePlan(USER, EMAIL)).resolves.toBe("free");
  });

  it("matches email case-insensitively", async () => {
    fake().seed("subscriptions", [sub({ user_id: null, email: EMAIL, plan: "pro" })]);
    await expect(getEffectivePlan("other", "BUYER@Example.COM")).resolves.toBe("pro");
  });

  it("reproduces the production row that triggered this fix", async () => {
    // support@d1autozone.com: pro, active, period ended 2026-08-01, no Creem
    // link — so nothing could ever cancel it.
    fake().seed("subscriptions", [
      {
        id: "44cba917-7508-42ab-b169-94dfa3524c8e",
        user_id: "0a5e892b-621c-4886-abda-070f81db3229",
        email: "support@d1autozone.com",
        plan: "pro",
        status: "active",
        current_period_end: "2026-08-01T00:00:00+00:00",
        creem_subscription_id: null,
      },
    ]);
    await expect(
      getEffectivePlan("0a5e892b-621c-4886-abda-070f81db3229", "support@d1autozone.com"),
    ).resolves.toBe("free");
  });
});
