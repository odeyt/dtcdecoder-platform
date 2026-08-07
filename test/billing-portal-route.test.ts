import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";

// POST /api/account/billing-portal generates a Creem-hosted billing-portal
// link for the signed-in user's own subscription — these tests exercise
// every guard (billing-enabled, auth, ownership, comp, missing customer id)
// and confirm Creem is never called on any guard rejection, mirroring
// test/billing-actions.test.ts's pattern for the sibling cancel/resume
// actions.
let mockUser: { id: string; email: string } | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
  }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabase = fake;
  return { createAdminClient: () => fake };
});

const createCustomerPortalLinkMock = vi.fn();
vi.mock("@/lib/payments/creem", () => ({
  createCustomerPortalLink: (...args: unknown[]) => createCustomerPortalLinkMock(...args),
}));

const { POST } = await import("@/app/api/account/billing-portal/route");

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

function seedRow(overrides: Record<string, unknown> = {}) {
  fake().seed("subscriptions", [
    {
      id: "row-1",
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

let originalBillingEnabled: string | undefined;

beforeEach(() => {
  fake().reset();
  createCustomerPortalLinkMock.mockReset();
  mockUser = { id: "user-1", email: "user1@example.com" };
  originalBillingEnabled = process.env.NEXT_PUBLIC_BILLING_ENABLED;
  process.env.NEXT_PUBLIC_BILLING_ENABLED = "true";
});

afterEach(() => {
  if (originalBillingEnabled === undefined) delete process.env.NEXT_PUBLIC_BILLING_ENABLED;
  else process.env.NEXT_PUBLIC_BILLING_ENABLED = originalBillingEnabled;
});

describe("POST /api/account/billing-portal", () => {
  it("returns 503 and never calls Creem when billing is disabled", async () => {
    process.env.NEXT_PUBLIC_BILLING_ENABLED = "false";
    const res = await POST();
    expect(res.status).toBe(503);
    expect(createCustomerPortalLinkMock).not.toHaveBeenCalled();
  });

  it("returns 401 and never calls Creem when signed out", async () => {
    mockUser = null;
    const res = await POST();
    expect(res.status).toBe(401);
    expect(createCustomerPortalLinkMock).not.toHaveBeenCalled();
  });

  it("returns 404 and never calls Creem when the user has no subscription row", async () => {
    const res = await POST();
    expect(res.status).toBe(404);
    expect(createCustomerPortalLinkMock).not.toHaveBeenCalled();
  });

  it("returns 403 and never calls Creem for a comped subscription", async () => {
    seedRow({ is_comp: true });
    const res = await POST();
    expect(res.status).toBe(403);
    expect(createCustomerPortalLinkMock).not.toHaveBeenCalled();
  });

  it("returns 409 and never calls Creem when creem_customer_id is missing", async () => {
    seedRow({ creem_customer_id: null });
    const res = await POST();
    expect(res.status).toBe(409);
    expect(createCustomerPortalLinkMock).not.toHaveBeenCalled();
  });

  it("calls Creem with the user's own creem_customer_id and returns the portal URL", async () => {
    seedRow();
    createCustomerPortalLinkMock.mockResolvedValue("https://creem.io/my-orders/login/xxx");

    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.portalUrl).toBe("https://creem.io/my-orders/login/xxx");
    expect(createCustomerPortalLinkMock).toHaveBeenCalledWith("creem_cust_1");
  });

  it("returns 500 when Creem throws", async () => {
    seedRow();
    createCustomerPortalLinkMock.mockRejectedValue(new Error("Creem API down"));

    const res = await POST();
    expect(res.status).toBe(500);
  });

  it("never touches a different user's subscription row", async () => {
    seedRow({ user_id: "user-2", email: "user2@example.com" });
    const res = await POST();
    expect(res.status).toBe(404);
    expect(createCustomerPortalLinkMock).not.toHaveBeenCalled();
  });
});
