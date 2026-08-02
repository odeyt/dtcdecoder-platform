import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";

// Duplicate-VIN charge-protection audit: when a customer re-runs a scan for
// a VIN they've already diagnosed, the quick-diagnostic and analyze routes
// should warn (DuplicateVinError, 409) instead of silently creating another
// charge. This tests the underlying lookup (findExistingCasesForVin/
// getVinForCase in cases.ts) the two routes both call before proceeding —
// see src/app/api/scan-diagnostics/cases/quick/route.ts and
// src/app/api/scan-diagnostics/cases/[caseId]/analyze/route.ts.
vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabase = fake;
  return { createAdminClient: () => fake };
});

const { findExistingCasesForVin, getVinForCase } = await import("@/lib/scan-diagnostics/cases");

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

function seedCaseWithVin(caseId: string, userId: string, vin: string | null, status = "completed") {
  fake().seed("scan_cases", [
    { id: caseId, user_id: userId, status, complaint: `Case for ${caseId}`, created_at: `2026-0${caseId.length}-01T00:00:00Z` },
  ]);
  if (vin !== null) {
    fake().seed("scan_extractions", [{ id: `ext-${caseId}`, case_id: caseId, vin }]);
  }
}

beforeEach(() => {
  fake().reset();
});

describe("findExistingCasesForVin", () => {
  it("finds a prior case for the same user with an exact VIN match", async () => {
    seedCaseWithVin("case-a", "user-1", "1FTFW1ET1EFA00001");

    const result = await findExistingCasesForVin("user-1", "1FTFW1ET1EFA00001");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("case-a");
  });

  it("matches case-insensitively and ignores surrounding whitespace", async () => {
    seedCaseWithVin("case-b", "user-1", "1ftfw1et1efa00001");

    const result = await findExistingCasesForVin("user-1", "  1FTFW1ET1EFA00001  ");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("case-b");
  });

  it("never returns a match belonging to a different user", async () => {
    seedCaseWithVin("case-c", "user-2", "1FTFW1ET1EFA00001");

    const result = await findExistingCasesForVin("user-1", "1FTFW1ET1EFA00001");

    expect(result).toHaveLength(0);
  });

  it("never matches a different VIN for the same user", async () => {
    seedCaseWithVin("case-d", "user-1", "1FTFW1ET1EFA00002");

    const result = await findExistingCasesForVin("user-1", "1FTFW1ET1EFA00001");

    expect(result).toHaveLength(0);
  });

  it("excludes the case passed as excludeCaseId (the case currently being analyzed)", async () => {
    seedCaseWithVin("case-e", "user-1", "1FTFW1ET1EFA00001");

    const result = await findExistingCasesForVin("user-1", "1FTFW1ET1EFA00001", "case-e");

    expect(result).toHaveLength(0);
  });

  it("still finds OTHER cases for the same VIN even when excluding the current one", async () => {
    seedCaseWithVin("case-f1", "user-1", "1FTFW1ET1EFA00001");
    seedCaseWithVin("case-f2", "user-1", "1FTFW1ET1EFA00001");

    const result = await findExistingCasesForVin("user-1", "1FTFW1ET1EFA00001", "case-f2");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("case-f1");
  });

  it("ignores cases with no scan_extractions row at all (e.g. still draft)", async () => {
    seedCaseWithVin("case-g", "user-1", null, "draft");

    const result = await findExistingCasesForVin("user-1", "1FTFW1ET1EFA00001");

    expect(result).toHaveLength(0);
  });

  it("returns an empty array for a blank VIN without querying anything meaningful", async () => {
    seedCaseWithVin("case-h", "user-1", "1FTFW1ET1EFA00001");

    const result = await findExistingCasesForVin("user-1", "   ");

    expect(result).toHaveLength(0);
  });

  it("returns multiple matches sorted newest first", async () => {
    seedCaseWithVin("case-i-old", "user-1", "1FTFW1ET1EFA00001");
    fake().dump("scan_cases").find((c) => c.id === "case-i-old")!.created_at = "2026-01-01T00:00:00Z";
    seedCaseWithVin("case-i-new", "user-1", "1FTFW1ET1EFA00001");
    fake().dump("scan_cases").find((c) => c.id === "case-i-new")!.created_at = "2026-06-01T00:00:00Z";

    const result = await findExistingCasesForVin("user-1", "1FTFW1ET1EFA00001");

    expect(result.map((c) => c.id)).toEqual(["case-i-new", "case-i-old"]);
  });
});

describe("getVinForCase", () => {
  it("returns the case's VIN", async () => {
    seedCaseWithVin("case-j", "user-1", "1FTFW1ET1EFA00001");
    expect(await getVinForCase("case-j")).toBe("1FTFW1ET1EFA00001");
  });

  it("returns null when the case has no extraction row yet", async () => {
    seedCaseWithVin("case-k", "user-1", null, "draft");
    expect(await getVinForCase("case-k")).toBeNull();
  });

  it("returns null when the extraction row exists but VIN was never captured", async () => {
    seedCaseWithVin("case-l", "user-1", null);
    fake().seed("scan_extractions", [{ id: "ext-case-l", case_id: "case-l", vin: null }]);
    expect(await getVinForCase("case-l")).toBeNull();
  });
});
