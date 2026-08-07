import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";

// getOwnSubscription backs the /account billing card; it must resolve the
// exact same row getEffectivePlan does (user_id-then-email fallback,
// lapsed-row exclusion) so the plan label and the billing controls never
// disagree about which subscription is current. Also covers
// upsertSubscriptionFromWebhook's new cancel_at_period_end handling.
vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabase = fake;
  return { createAdminClient: () => fake };
});

const { getEffectivePlan, getOwnSubscription, upsertSubscriptionFromWebhook } = await import(
  "@/lib/subscriptions"
);

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

function seedRow(overrides: Record<string, unknown> = {}) {
  fake().seed("subscriptions", [
    {
      id: overrides.id ?? "sub-row-1",
      user_id: "user-1",
      email: "user1@example.com",
      plan: "pro",
      billing_interval: "monthly",
      status: "active",
      creem_subscription_id: "creem_sub_1",
      creem_customer_id: "creem_cust_1",
      current_period_end: "2099-01-01T00:00:00Z",
      is_comp: false,
      comp_reason: null,
      cancel_at_period_end: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      ...overrides,
    },
  ]);
}

beforeEach(() => {
  fake().reset();
});

describe("getOwnSubscription", () => {
  it("returns the user_id match even when an email-matched row also exists", async () => {
    seedRow({ id: "row-user", user_id: "user-1", email: "user1@example.com" });
    seedRow({ id: "row-email-only", user_id: null, email: "user1@example.com", creem_subscription_id: "creem_sub_2" });

    const result = await getOwnSubscription("user-1", "user1@example.com");
    expect(result?.id).toBe("row-user");
  });

  it("falls back to email match when no user_id row exists, and agrees with getEffectivePlan", async () => {
    seedRow({ id: "row-email", user_id: null, email: "user1@example.com", plan: "workshop" });

    const own = await getOwnSubscription("user-1", "user1@example.com");
    const plan = await getEffectivePlan("user-1", "user1@example.com");

    expect(own?.id).toBe("row-email");
    expect(own?.plan).toBe("workshop");
    expect(plan).toBe("workshop");
  });

  it("returns null for a user with no active row", async () => {
    const result = await getOwnSubscription("user-nobody", "nobody@example.com");
    expect(result).toBeNull();
  });

  it("excludes a lapsed row (current_period_end in the past)", async () => {
    seedRow({ current_period_end: "2020-01-01T00:00:00Z" });

    const result = await getOwnSubscription("user-1", "user1@example.com");
    expect(result).toBeNull();
  });

  it("returns a comped row rather than filtering it out — the caller guards is_comp", async () => {
    seedRow({ is_comp: true, comp_reason: "beta tester" });

    const result = await getOwnSubscription("user-1", "user1@example.com");
    expect(result?.is_comp).toBe(true);
  });
});

describe("upsertSubscriptionFromWebhook cancel_at_period_end handling", () => {
  function baseUpdate(overrides: Record<string, unknown> = {}) {
    return {
      creemSubscriptionId: "creem_sub_1",
      creemCustomerId: "creem_cust_1",
      email: "user1@example.com",
      userId: "user-1",
      plan: "pro" as const,
      interval: "monthly" as const,
      status: "active" as const,
      currentPeriodEnd: "2099-01-01T00:00:00Z",
      ...overrides,
    };
  }

  it("sets cancel_at_period_end true when explicitly passed", async () => {
    await upsertSubscriptionFromWebhook(baseUpdate({ cancelAtPeriodEnd: true }));
    const row = fake().dump("subscriptions").find((r) => r.creem_subscription_id === "creem_sub_1");
    expect(row?.cancel_at_period_end).toBe(true);
  });

  it("clears cancel_at_period_end when explicitly passed false", async () => {
    seedRow({ cancel_at_period_end: true });
    await upsertSubscriptionFromWebhook(baseUpdate({ cancelAtPeriodEnd: false }));
    const row = fake().dump("subscriptions").find((r) => r.creem_subscription_id === "creem_sub_1");
    expect(row?.cancel_at_period_end).toBe(false);
  });

  it("preserves the existing value when omitted (e.g. subscription.past_due)", async () => {
    seedRow({ cancel_at_period_end: true });
    await upsertSubscriptionFromWebhook(baseUpdate({ status: "past_due" }));
    const row = fake().dump("subscriptions").find((r) => r.creem_subscription_id === "creem_sub_1");
    expect(row?.cancel_at_period_end).toBe(true);
  });
});
