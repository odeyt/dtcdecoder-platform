import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";

// cancelSubscriptionAction/resumeSubscriptionAction never take a
// subscription id from the client — the target row is always resolved
// server-side from the authenticated session via getOwnSubscription. These
// tests exercise that ownership resolution plus the is_comp/idempotency
// guards, and confirm Creem is never called on any guard rejection.
let mockUser: { id: string; email: string } | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
  }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabase = fake;
  return { createAdminClient: () => fake };
});

const cancelSubscriptionMock = vi.fn();
const resumeSubscriptionMock = vi.fn();
vi.mock("@/lib/payments/creem", () => ({
  cancelSubscription: (...args: unknown[]) => cancelSubscriptionMock(...args),
  resumeSubscription: (...args: unknown[]) => resumeSubscriptionMock(...args),
}));

const { cancelSubscriptionAction, resumeSubscriptionAction } = await import(
  "@/app/(app)/account/billing-actions"
);

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

function seedRow(id: string, overrides: Record<string, unknown> = {}) {
  fake().seed("subscriptions", [
    {
      id,
      user_id: "user-1",
      email: "user1@example.com",
      plan: "pro",
      billing_interval: "monthly",
      status: "active",
      creem_subscription_id: `creem_${id}`,
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
  cancelSubscriptionMock.mockReset();
  resumeSubscriptionMock.mockReset();
  mockUser = { id: "user-1", email: "user1@example.com" };
});

describe("cancelSubscriptionAction", () => {
  it("errors and never calls Creem when signed out", async () => {
    mockUser = null;
    const result = await cancelSubscriptionAction();
    expect(result.error).toBeTruthy();
    expect(cancelSubscriptionMock).not.toHaveBeenCalled();
  });

  it("errors and never calls Creem when the user has no matching subscription row", async () => {
    const result = await cancelSubscriptionAction();
    expect(result.error).toBeTruthy();
    expect(cancelSubscriptionMock).not.toHaveBeenCalled();
  });

  it("errors and never calls Creem for a comped subscription", async () => {
    seedRow("row-1", { is_comp: true });
    const result = await cancelSubscriptionAction();
    expect(result.error).toBeTruthy();
    expect(cancelSubscriptionMock).not.toHaveBeenCalled();
  });

  it("calls Creem with the user's own creem_subscription_id and flips cancel_at_period_end on success", async () => {
    seedRow("row-1");
    cancelSubscriptionMock.mockResolvedValue({ id: "creem_row-1", status: "active" });

    const result = await cancelSubscriptionAction();

    expect(result.success).toBe(true);
    expect(cancelSubscriptionMock).toHaveBeenCalledWith("creem_row-1");
    const row = fake().dump("subscriptions").find((r) => r.id === "row-1");
    expect(row?.cancel_at_period_end).toBe(true);
  });

  it("returns an error and never flips cancel_at_period_end when Creem throws", async () => {
    seedRow("row-1");
    cancelSubscriptionMock.mockRejectedValue(new Error("Creem API down"));

    const result = await cancelSubscriptionAction();

    expect(result.error).toBeTruthy();
    const row = fake().dump("subscriptions").find((r) => r.id === "row-1");
    expect(row?.cancel_at_period_end).toBe(false);
  });

  it("is idempotent when already scheduled to cancel — succeeds without calling Creem again", async () => {
    seedRow("row-1", { cancel_at_period_end: true });
    const result = await cancelSubscriptionAction();
    expect(result.success).toBe(true);
    expect(cancelSubscriptionMock).not.toHaveBeenCalled();
  });

  it("never touches a different user's subscription row", async () => {
    seedRow("row-other-user", { user_id: "user-2", email: "user2@example.com" });
    const result = await cancelSubscriptionAction();
    expect(result.error).toBeTruthy();
    expect(cancelSubscriptionMock).not.toHaveBeenCalled();
    const row = fake().dump("subscriptions").find((r) => r.id === "row-other-user");
    expect(row?.cancel_at_period_end).toBe(false);
  });
});

describe("resumeSubscriptionAction", () => {
  it("errors and never calls Creem when signed out", async () => {
    mockUser = null;
    const result = await resumeSubscriptionAction();
    expect(result.error).toBeTruthy();
    expect(resumeSubscriptionMock).not.toHaveBeenCalled();
  });

  it("errors and never calls Creem for a comped subscription", async () => {
    seedRow("row-1", { is_comp: true, cancel_at_period_end: true });
    const result = await resumeSubscriptionAction();
    expect(result.error).toBeTruthy();
    expect(resumeSubscriptionMock).not.toHaveBeenCalled();
  });

  it("calls Creem and clears cancel_at_period_end on success", async () => {
    seedRow("row-1", { cancel_at_period_end: true });
    resumeSubscriptionMock.mockResolvedValue({ id: "creem_row-1", status: "active" });

    const result = await resumeSubscriptionAction();

    expect(result.success).toBe(true);
    expect(resumeSubscriptionMock).toHaveBeenCalledWith("creem_row-1");
    const row = fake().dump("subscriptions").find((r) => r.id === "row-1");
    expect(row?.cancel_at_period_end).toBe(false);
  });

  it("is idempotent when nothing is pending — succeeds without calling Creem", async () => {
    seedRow("row-1", { cancel_at_period_end: false });
    const result = await resumeSubscriptionAction();
    expect(result.success).toBe(true);
    expect(resumeSubscriptionMock).not.toHaveBeenCalled();
  });

  it("returns an error and never clears cancel_at_period_end when Creem throws", async () => {
    seedRow("row-1", { cancel_at_period_end: true });
    resumeSubscriptionMock.mockRejectedValue(new Error("Creem API down"));

    const result = await resumeSubscriptionAction();

    expect(result.error).toBeTruthy();
    const row = fake().dump("subscriptions").find((r) => r.id === "row-1");
    expect(row?.cancel_at_period_end).toBe(true);
  });
});
