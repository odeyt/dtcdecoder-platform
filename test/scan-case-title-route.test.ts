import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";

let currentUser: { id: string; email: string } | null = { id: "user-1", email: "tech@example.com" };
const getCaseForOwnerMock = vi.fn();

vi.mock("@/lib/env", () => ({ env: { scanDiagnosticsEnabled: () => true } }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
  }),
}));
vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabase = fake;
  return { createAdminClient: () => fake };
});
vi.mock("@/lib/scan-diagnostics/cases", () => ({
  getCaseForOwner: (...args: unknown[]) => getCaseForOwnerMock(...args),
}));

const { PATCH } = await import("@/app/api/scan-diagnostics/cases/[caseId]/title/route");
const { ScanCaseNotFoundError } = await import("@/lib/scan-diagnostics/api-errors");

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

function makeRequest(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof PATCH>[0];
}

function callRoute(caseId: string, body: unknown) {
  return PATCH(makeRequest(body), { params: Promise.resolve({ caseId }) });
}

beforeEach(() => {
  fake().reset();
  currentUser = { id: "user-1", email: "tech@example.com" };
  getCaseForOwnerMock.mockReset().mockResolvedValue({ id: "case-1", user_id: "user-1" });
  fake().seed("scan_cases", [{ id: "case-1", user_id: "user-1", title: null }]);
});

describe("PATCH /api/scan-diagnostics/cases/[caseId]/title — authentication", () => {
  it("rejects an unauthenticated request with 401 and never touches ownership/DB", async () => {
    currentUser = null;
    const res = await callRoute("case-1", { title: "Mom's Honda" });
    expect(res.status).toBe(401);
    expect(getCaseForOwnerMock).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/scan-diagnostics/cases/[caseId]/title — ownership", () => {
  it("returns 404 for a case the caller doesn't own, and never updates scan_cases", async () => {
    getCaseForOwnerMock.mockRejectedValue(new ScanCaseNotFoundError());

    const res = await callRoute("someone-elses-case", { title: "Renamed" });
    expect(res.status).toBe(404);
    expect(fake().dump("scan_cases")[0].title).toBeNull();
  });
});

describe("PATCH /api/scan-diagnostics/cases/[caseId]/title — validation and persistence", () => {
  it("sets a trimmed custom title", async () => {
    const res = await callRoute("case-1", { title: "  Mom's Honda — AC issue  " });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Mom's Honda — AC issue");
    expect(fake().dump("scan_cases")[0].title).toBe("Mom's Honda — AC issue");
  });

  it("clears back to null when given an empty (or all-whitespace) title", async () => {
    fake().dump("scan_cases")[0].title = "Existing title";

    const res = await callRoute("case-1", { title: "   " });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBeNull();
    expect(fake().dump("scan_cases")[0].title).toBeNull();
  });

  it("rejects a title over 120 characters", async () => {
    const res = await callRoute("case-1", { title: "x".repeat(121) });
    expect(res.status).toBe(400);
    expect(fake().dump("scan_cases")[0].title).toBeNull();
  });

  it("rejects a malformed body", async () => {
    const res = await callRoute("case-1", { title: 123 });
    expect(res.status).toBe(400);
  });
});
