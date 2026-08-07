import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";

// GET /api/account/plan is the client-callable bridge SiteNav uses to know
// whether to show "Pricing" or "Account" — the subscriptions table has no
// RLS policy, so the client can't resolve this itself the way it resolves
// auth state.
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

const { GET } = await import("@/app/api/account/plan/route");

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

beforeEach(() => {
  fake().reset();
  mockUser = { id: "user-1", email: "user1@example.com" };
});

describe("GET /api/account/plan", () => {
  it("returns 401 when signed out", async () => {
    mockUser = null;
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns free for a user with no active subscription", async () => {
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.plan).toBe("free");
  });

  it("returns the plan from the user's own active subscription row", async () => {
    fake().seed("subscriptions", [
      {
        id: "row-1",
        user_id: "user-1",
        email: "user1@example.com",
        plan: "workshop",
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
      },
    ]);

    const res = await GET();
    const body = await res.json();
    expect(body.plan).toBe("workshop");
  });
});
