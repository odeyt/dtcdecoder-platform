import { describe, expect, it, beforeEach, vi } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";

// See test/scan-extraction-persistence.test.ts for why the fake is stashed
// on globalThis: it's constructed inside the (async) vi.mock factory, and
// the test body needs a reference to the SAME instance to seed rows into.
vi.mock("@/lib/supabase/server", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fakeClient = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabase = fakeClient;
  return { createClient: async () => fakeClient };
});

const { resolveDtcLookup } = await import("@/lib/dtc-lookup");

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

function dtcRow(overrides: Record<string, unknown>) {
  return {
    id: crypto.randomUUID(),
    code: "P0300",
    make: null,
    model: null,
    engine_code: null,
    slug: "p0300",
    title: "Random/Multiple Cylinder Misfire Detected",
    meta_description: null,
    meaning: "Random/Multiple Cylinder Misfire Detected",
    symptoms: [],
    causes: [],
    diagnostic_steps: [],
    common_mistakes: null,
    difficulty: "moderate",
    severity: "moderate",
    drive_recommendation: null,
    related_makes: [],
    faq: [],
    pdf_url: null,
    youtube_url: null,
    search_count: 0,
    is_published: true,
    normalized_code: "P0300",
    family: "P",
    code_type: "generic",
    generic_definition: true,
    manufacturer_specific: false,
    reserved_code: false,
    source_type: "original",
    source_name: null,
    source_url: null,
    source_license: null,
    source_version: null,
    source_hash: null,
    review_status: "approved",
    reviewed_by: null,
    reviewed_at: null,
    active: true,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

beforeEach(() => {
  fake().reset();
});

describe("resolveDtcLookup — invalid input", () => {
  it("returns 'invalid' without querying the database at all", async () => {
    const result = await resolveDtcLookup("not a code");
    expect(result.resolutionType).toBe("invalid");
    expect(result.definition).toBeNull();
    expect(fake().dump("dtc_codes")).toEqual([]);
  });
});

describe("resolveDtcLookup — generic code found", () => {
  it("returns the published generic row", async () => {
    fake().seed("dtc_codes", [dtcRow({ code: "P0300", normalized_code: "P0300" })]);
    const result = await resolveDtcLookup("P0300");
    expect(result.resolutionType).toBe("generic");
    expect(result.definition?.code).toBe("P0300");
  });

  it("is case- and separator-insensitive", async () => {
    fake().seed("dtc_codes", [dtcRow({ code: "P0300", normalized_code: "P0300" })]);
    const result = await resolveDtcLookup("p-0300");
    expect(result.resolutionType).toBe("generic");
  });
});

describe("resolveDtcLookup — the U1003 case: manufacturer-specific, no row", () => {
  it("returns 'vehicle_context_required', never 'unknown' or a fabricated definition", async () => {
    const result = await resolveDtcLookup("U1003");
    expect(result.resolutionType).toBe("vehicle_context_required");
    expect(result.definition).toBeNull();
  });

  it("lists manufacturers that DO have a published variant of the code, if any exist", async () => {
    fake().seed("dtc_codes", [
      dtcRow({ code: "U1003", normalized_code: "U1003", make: "Toyota", is_published: true, active: true }),
      dtcRow({ code: "U1003", normalized_code: "U1003", make: "Ford", is_published: true, active: true }),
    ]);
    const result = await resolveDtcLookup("U1003");
    expect(result.resolutionType).toBe("vehicle_context_required");
    expect(result.availableManufacturers.sort()).toEqual(["Ford", "Toyota"]);
  });

  it("returns the exact manufacturer row when vehicle context narrows to a match", async () => {
    fake().seed("dtc_codes", [
      dtcRow({ code: "U1003", normalized_code: "U1003", make: "Toyota", is_published: true, active: true }),
    ]);
    const result = await resolveDtcLookup("U1003", { make: "Toyota" });
    expect(result.resolutionType).toBe("manufacturer_exact");
    expect(result.definition?.make).toBe("Toyota");
  });
});

describe("resolveDtcLookup — generic code genuinely missing", () => {
  it("returns 'unknown', never the old fabricated 'not in database yet' string", async () => {
    const result = await resolveDtcLookup("P0999");
    expect(result.resolutionType).toBe("unknown");
    expect(result.definition).toBeNull();
  });

  it("offers related same-family codes alongside the unknown state", async () => {
    fake().seed("dtc_codes", [dtcRow({ code: "P0998", normalized_code: "P0998", is_published: true, active: true })]);
    const result = await resolveDtcLookup("P0999");
    expect(result.resolutionType).toBe("unknown");
    expect(result.relatedCodes.map((r) => r.code)).toContain("P0998");
  });
});

describe("resolveDtcLookup — reserved code", () => {
  it("returns 'reserved' when the stored row is flagged reserved_code", async () => {
    fake().seed("dtc_codes", [
      dtcRow({ code: "C0300", normalized_code: "C0300", reserved_code: true, is_published: true, active: true }),
    ]);
    const result = await resolveDtcLookup("C0300");
    expect(result.resolutionType).toBe("reserved");
  });
});

describe("resolveDtcLookup — never fabricates", () => {
  it("only ever returns a definition object sourced from a real database row", async () => {
    fake().seed("dtc_codes", [dtcRow({ code: "P0300", normalized_code: "P0300" })]);
    const result = await resolveDtcLookup("P0300");
    expect(result.definition).not.toBeNull();
    expect(result.definition?.id).toBeTruthy();
  });

  it("ignores unpublished or inactive rows", async () => {
    fake().seed("dtc_codes", [
      dtcRow({ code: "P0300", normalized_code: "P0300", is_published: false }),
    ]);
    const result = await resolveDtcLookup("P0300");
    expect(result.resolutionType).toBe("unknown");
  });
});
