import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";

let currentUser: { id: string; email: string } | null = { id: "user-1", email: "tech@example.com" };
const getCaseForOwnerMock = vi.fn();
const getEffectivePlanMock = vi.fn();
const getAllowedOutputLocalesMock = vi.fn();

vi.mock("@/lib/env", () => ({ env: { scanDiagnosticsEnabled: () => true } }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
  }),
}));
// toSafeErrorResponse resolves the caller's locale (Supabase auth + the
// interface-locale cookie) before picking a translated error message —
// next/headers's cookies() throws outside a real request scope.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
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
vi.mock("@/lib/subscriptions", () => ({ getEffectivePlan: (...args: unknown[]) => getEffectivePlanMock(...args) }));
vi.mock("@/lib/i18n/languages", () => ({
  getAllowedOutputLocales: (...args: unknown[]) => getAllowedOutputLocalesMock(...args),
}));

const { PATCH } = await import("@/app/api/scan-diagnostics/cases/[caseId]/language/route");
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
  getEffectivePlanMock.mockReset().mockResolvedValue("pro");
  getAllowedOutputLocalesMock.mockReset().mockResolvedValue([{ locale_code: "es", english_name: "Spanish" }]);
  fake().seed("scan_cases", [{ id: "case-1", user_id: "user-1", report_language: "en" }]);
});

describe("PATCH /api/scan-diagnostics/cases/[caseId]/language — authentication", () => {
  it("rejects an unauthenticated request with 401 and never touches ownership/locale checks", async () => {
    currentUser = null;
    const res = await callRoute("case-1", { locale: "es" });
    expect(res.status).toBe(401);
    expect(getCaseForOwnerMock).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/scan-diagnostics/cases/[caseId]/language — ownership", () => {
  it("returns 404 for a case the caller doesn't own, and never updates scan_cases", async () => {
    getCaseForOwnerMock.mockRejectedValue(new ScanCaseNotFoundError());

    const res = await callRoute("someone-elses-case", { locale: "es" });
    expect(res.status).toBe(404);
    expect(fake().dump("scan_cases")[0].report_language).toBe("en");
  });
});

describe("PATCH /api/scan-diagnostics/cases/[caseId]/language — locale validation", () => {
  it("rejects a locale not in this plan's allowed output locales", async () => {
    getAllowedOutputLocalesMock.mockResolvedValue([{ locale_code: "es", english_name: "Spanish" }]);

    const res = await callRoute("case-1", { locale: "fr" });
    expect(res.status).toBe(403);
    expect(fake().dump("scan_cases")[0].report_language).toBe("en");
  });

  it("accepts a locale that IS in this plan's allowed output locales and updates the case", async () => {
    getAllowedOutputLocalesMock.mockResolvedValue([{ locale_code: "es", english_name: "Spanish" }]);

    const res = await callRoute("case-1", { locale: "es" });
    expect(res.status).toBe(200);
    expect(fake().dump("scan_cases")[0].report_language).toBe("es");
  });

  it("always allows switching back to English, without consulting the allowed-locales list", async () => {
    getAllowedOutputLocalesMock.mockResolvedValue([]);

    const res = await callRoute("case-1", { locale: "en" });
    expect(res.status).toBe(200);
    expect(getAllowedOutputLocalesMock).not.toHaveBeenCalled();
    expect(fake().dump("scan_cases")[0].report_language).toBe("en");
  });

  it("rejects a malformed body", async () => {
    const res = await callRoute("case-1", { locale: "" });
    expect(res.status).toBe(400);
  });
});
