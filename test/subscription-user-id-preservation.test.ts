import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";

// A paying Workshop customer was found in production with an `active`
// subscription whose `user_id` was null. Creem puts the checkout's
// metadata.user_id on the subscription it creates, but later lifecycle
// events for that same subscription — renewals especially — can arrive
// without it. The upsert wrote `update.userId` unconditionally, so one
// metadata-less renewal unlinked the account: billing continued (status
// stayed `active`) while getEffectivePlan's user_id lookup stopped
// matching.
//
// It only stayed invisible because getEffectivePlan also matches on email.
// That safety net disappears the moment a customer's Creem billing email
// differs from their login email — then they pay in full and are served
// Free-tier entitlement, silently.

vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabase = fake;
  return { createAdminClient: () => fake };
});

const { upsertSubscriptionFromWebhook } = await import("@/lib/subscriptions");

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

const SUB_ID = "sub_creem_123";
const USER_ID = "c5cae9ac-cfd9-4cde-8b59-1c9e48849bec";

const event = (over: Partial<Parameters<typeof upsertSubscriptionFromWebhook>[0]> = {}) => ({
  creemSubscriptionId: SUB_ID,
  creemCustomerId: "cus_1",
  email: "Owner@Example.com",
  userId: USER_ID as string | null,
  plan: "workshop" as const,
  interval: "monthly" as const,
  status: "active" as const,
  currentPeriodEnd: "2026-09-26T10:40:18.929Z",
  ...over,
});

const row = () => fake().dump("subscriptions").find((r) => r.creem_subscription_id === SUB_ID);

beforeEach(() => {
  fake().reset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("a renewal without metadata must not unlink a paying customer", () => {
  it("keeps the stored user_id when the event carries none", async () => {
    await upsertSubscriptionFromWebhook(event());
    expect(row()?.user_id).toBe(USER_ID);

    // The renewal: same subscription, later period, no metadata.user_id.
    await upsertSubscriptionFromWebhook(
      event({ userId: null, currentPeriodEnd: "2026-10-26T10:40:18.929Z" }),
    );

    expect(row()?.user_id).toBe(USER_ID);
    // The rest of the renewal still applies — this preserves one field, it
    // does not discard the event.
    expect(row()?.current_period_end).toBe("2026-10-26T10:40:18.929Z");
    expect(row()?.status).toBe("active");
  });

  it("warns when it has to fall back, so a silent unlink cannot recur unnoticed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await upsertSubscriptionFromWebhook(event());
    await upsertSubscriptionFromWebhook(event({ userId: null }));

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("preserving the existing account link"), SUB_ID);
  });

  it("still records a subscription that has never been linked, and flags it", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await upsertSubscriptionFromWebhook(event({ userId: null }));

    // Billing is real; the row must exist so the email fallback can work.
    expect(row()).toBeDefined();
    expect(row()?.user_id).toBeNull();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("no account link"), SUB_ID);
  });
});

describe("a genuine account link is still applied", () => {
  it("sets user_id on first write", async () => {
    await upsertSubscriptionFromWebhook(event());
    expect(row()?.user_id).toBe(USER_ID);
  });

  it("lets a later event move the subscription to a different account", async () => {
    await upsertSubscriptionFromWebhook(event({ userId: null }));
    expect(row()?.user_id).toBeNull();

    await upsertSubscriptionFromWebhook(event({ userId: USER_ID }));
    expect(row()?.user_id).toBe(USER_ID);

    const other = "0a5e892b-621c-4886-abda-070f81db3229";
    await upsertSubscriptionFromWebhook(event({ userId: other }));
    expect(row()?.user_id).toBe(other);
  });

  it("normalizes the billing email to lower case", async () => {
    await upsertSubscriptionFromWebhook(event());
    expect(row()?.email).toBe("owner@example.com");
  });
});

describe("stale-event guard is unaffected", () => {
  it("ignores an event referencing an older period, without touching user_id", async () => {
    await upsertSubscriptionFromWebhook(event());

    await upsertSubscriptionFromWebhook(
      event({ userId: null, status: "canceled", currentPeriodEnd: "2026-08-26T10:40:18.929Z" }),
    );

    expect(row()?.status).toBe("active");
    expect(row()?.user_id).toBe(USER_ID);
  });
});
