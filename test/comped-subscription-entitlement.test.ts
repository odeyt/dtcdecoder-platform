import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";

// The whole point of flagging a subscription as comped (migration 0045)
// rather than deleting it: the row still has to grant entitlement. Deleting
// the comped rows would have made /admin/profitability honest at the cost of
// silently revoking two accounts' access, because getEffectivePlan derives
// the plan from this same table.
//
// These tests pin the separation: is_comp affects revenue reporting only,
// never authorization. If someone later "optimizes" getEffectivePlan by
// filtering on is_comp, these fail.

vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabase = fake;
  return { createAdminClient: () => fake };
});

const { getEffectivePlan } = await import("@/lib/subscriptions");
const { getActiveSubscriptionCounts, estimateMonthlyRecurringRevenueUsd } = await import(
  "@/lib/admin-profitability"
);

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

const USER_ID = "c5cae9ac-cfd9-4cde-8b59-1c9e48849bec";
const EMAIL = "owner@example.com";
const future = new Date(Date.now() + 20 * 864e5).toISOString();

beforeEach(() => fake().reset());

describe("a comped subscription still grants entitlement", () => {
  it("resolves the comped plan by user_id", async () => {
    fake().seed("subscriptions", [
      {
        id: "s1",
        user_id: USER_ID,
        email: EMAIL,
        plan: "workshop",
        status: "active",
        current_period_end: future,
        is_comp: true,
      },
    ]);

    await expect(getEffectivePlan(USER_ID, EMAIL)).resolves.toBe("workshop");
  });

  it("resolves the comped plan by the email fallback too", async () => {
    fake().seed("subscriptions", [
      {
        id: "s1",
        user_id: null,
        email: EMAIL,
        plan: "pro",
        status: "active",
        current_period_end: future,
        is_comp: true,
      },
    ]);

    await expect(getEffectivePlan("some-other-user-id", EMAIL)).resolves.toBe("pro");
  });

  it("grants entitlement and reports zero revenue from the same row", async () => {
    fake().seed("subscriptions", [
      {
        id: "s1",
        user_id: USER_ID,
        email: EMAIL,
        plan: "workshop",
        status: "active",
        current_period_end: future,
        is_comp: true,
      },
    ]);

    // Both facts hold simultaneously — that is the entire design.
    await expect(getEffectivePlan(USER_ID, EMAIL)).resolves.toBe("workshop");
    const counts = await getActiveSubscriptionCounts();
    expect(estimateMonthlyRecurringRevenueUsd(counts)).toBe(0);
    expect(counts.compedWorkshop).toBe(1);
  });

  it("does not grant entitlement when the comped row is canceled", async () => {
    // is_comp is not an override — the normal status rules still apply.
    fake().seed("subscriptions", [
      {
        id: "s1",
        user_id: USER_ID,
        email: EMAIL,
        plan: "workshop",
        status: "canceled",
        current_period_end: future,
        is_comp: true,
      },
    ]);

    await expect(getEffectivePlan(USER_ID, EMAIL)).resolves.toBe("free");
  });
});
