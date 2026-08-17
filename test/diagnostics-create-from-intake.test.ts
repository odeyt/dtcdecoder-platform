import { describe, expect, it, vi, beforeEach } from "vitest";

let currentUser: { id: string; email: string } | null = { id: "user-1", email: "tech@example.com" };
const createQuickDiagnosticCaseMock = vi.fn();
const recordEventMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/env", () => ({ env: { scanDiagnosticsEnabled: () => true } }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
  }),
}));
// Every response now resolves the caller's locale (Supabase auth + the
// interface-locale cookie) for translated error/success text —
// next/headers's cookies() throws outside a real request scope, and an
// authenticated caller's locale lookup goes through getUserPreferences
// (createAdminClient), which needs a working fake client (no seeded row ->
// gracefully falls through to the cookie/default), same pattern as
// scan-case-title-route.test.ts.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  return { createAdminClient: () => createFakeSupabase() };
});
vi.mock("@/lib/scan-diagnostics/cases", () => ({
  createQuickDiagnosticCase: (...args: unknown[]) => createQuickDiagnosticCaseMock(...args),
}));
vi.mock("@/lib/analytics/events", () => ({ recordEvent: (...args: unknown[]) => recordEventMock(...args) }));

const { POST } = await import("@/app/api/diagnostics/create-from-intake/route");

function makeRequest(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  currentUser = { id: "user-1", email: "tech@example.com" };
  createQuickDiagnosticCaseMock.mockReset().mockResolvedValue({ id: "case-1" });
  recordEventMock.mockClear();
});

describe("POST /api/diagnostics/create-from-intake — authentication", () => {
  it("rejects an unauthenticated request with 401 and never creates a case", async () => {
    currentUser = null;
    const res = await POST(makeRequest({ intake: { dtcCodes: ["P0303"], locale: "en", currentStep: "complete" } }));
    expect(res.status).toBe(401);
    expect(createQuickDiagnosticCaseMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/diagnostics/create-from-intake — happy path", () => {
  it("creates a quick diagnostic case for a signed-in user and returns its id", async () => {
    const res = await POST(
      makeRequest({
        intake: {
          dtcCodes: ["P0303"],
          make: "Toyota",
          model: "Camry",
          year: "2018",
          complaint: "Rough idle",
          locale: "en",
          currentStep: "complete",
        },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.caseId).toBe("case-1");
    expect(createQuickDiagnosticCaseMock).toHaveBeenCalledWith(
      "user-1",
      // complaint must map to its own real field, never scanToolNotes —
      // regression for the bug where a technician's stated complaint had
      // nowhere correctly labeled to land and ended up lost/misfiled.
      expect.objectContaining({ dtcCode: "P0303", make: "Toyota", model: "Camry", modelYear: 2018, complaint: "Rough idle" }),
    );
    expect(recordEventMock).toHaveBeenCalledWith("diagnostic_case_created_from_intake", expect.anything());
  });
});

describe("POST /api/diagnostics/create-from-intake — validation", () => {
  it("returns 422 with NO_DTC_CODE when the intake has no identifiable code", async () => {
    const res = await POST(makeRequest({ intake: { dtcCodes: [], locale: "en", currentStep: "complete" } }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("NO_DTC_CODE");
    expect(createQuickDiagnosticCaseMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed request body", async () => {
    const res = await POST(makeRequest({ intake: { dtcCodes: "not-an-array" } }));
    expect(res.status).toBe(400);
    expect(createQuickDiagnosticCaseMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/diagnostics/create-from-intake — ownership", () => {
  it("always creates the case under the authenticated user's own id, never a client-supplied one", async () => {
    currentUser = { id: "real-user-id", email: "a@b.com" };
    await POST(
      makeRequest({
        intake: { dtcCodes: ["P0303"], locale: "en", currentStep: "complete", userId: "attacker-id" },
      }),
    );
    expect(createQuickDiagnosticCaseMock).toHaveBeenCalledWith("real-user-id", expect.anything());
  });
});
