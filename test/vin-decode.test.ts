import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";
import type { NhtsaResult } from "@/lib/vin/types";

// decodeVin (src/lib/vin/decode.ts) is the cache-then-NHTSA orchestration
// behind POST /api/vin/decode — this tests its validity rule (mirroring
// NHTSA's own ErrorCode/Make/Model contract, live-tested against the real
// API before this integration was built) and that a cache hit never re-hits
// NHTSA, both in-process against the fake Supabase client used elsewhere in
// this test suite (see test/duplicate-vin.test.ts for the same pattern).
vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabase = fake;
  return { createAdminClient: () => fake };
});

const fetchNhtsaDecodeVinValues = vi.fn<(vin: string) => Promise<NhtsaResult>>();
vi.mock("@/lib/vin/nhtsa", () => ({
  fetchNhtsaDecodeVinValues: (vin: string) => fetchNhtsaDecodeVinValues(vin),
}));

const { decodeVin } = await import("@/lib/vin/decode");

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

function nhtsaResult(overrides: Partial<NhtsaResult> = {}): NhtsaResult {
  return {
    Make: "HONDA",
    Model: "Accord",
    ModelYear: "2003",
    Trim: "EX-V6",
    Trim2: "",
    EngineCylinders: "6",
    DisplacementL: "2.998832712",
    ErrorCode: "0",
    ErrorText: "0 - VIN decoded clean. Check Digit (9th position) is correct",
    ...overrides,
  };
}

beforeEach(() => {
  fake().reset();
  fetchNhtsaDecodeVinValues.mockReset();
});

describe("decodeVin", () => {
  it("marks a clean decode (ErrorCode 0, Make+Model present) as valid", async () => {
    fetchNhtsaDecodeVinValues.mockResolvedValue(nhtsaResult());

    const result = await decodeVin("1HGCM82633A004352");

    expect(result.valid).toBe(true);
    expect(result.make).toBe("HONDA");
    expect(result.model).toBe("Accord");
    expect(result.year).toBe("2003");
    expect(result.engineSummary).toBe("6-cyl, 3.0L");
  });

  it("marks a non-zero ErrorCode as invalid", async () => {
    fetchNhtsaDecodeVinValues.mockResolvedValue(
      nhtsaResult({ ErrorCode: "6", ErrorText: "6 - Incomplete VIN", Make: "", Model: "" }),
    );

    const result = await decodeVin("1HGCM82633A00435X");

    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe("6");
  });

  it("marks ErrorCode 0 with empty Make/Model as invalid (partial/wildcarded VIN)", async () => {
    fetchNhtsaDecodeVinValues.mockResolvedValue(nhtsaResult({ ErrorCode: "0", Make: "", Model: "" }));

    const result = await decodeVin("5UXWX7C5XBAXXXXXX");

    expect(result.valid).toBe(false);
  });

  it("caches the result and never calls NHTSA again for the same VIN", async () => {
    fetchNhtsaDecodeVinValues.mockResolvedValue(nhtsaResult());

    const first = await decodeVin("1HGCM82633A004352");
    const second = await decodeVin("1HGCM82633A004352");

    expect(fetchNhtsaDecodeVinValues).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("caches a bad decode too, so a repeated garbage VIN never re-hits NHTSA", async () => {
    fetchNhtsaDecodeVinValues.mockResolvedValue(
      nhtsaResult({ ErrorCode: "7", ErrorText: "7 - Manufacturer not registered", Make: "", Model: "" }),
    );

    await decodeVin("11111111111111111");
    const second = await decodeVin("11111111111111111");

    expect(fetchNhtsaDecodeVinValues).toHaveBeenCalledTimes(1);
    expect(second.valid).toBe(false);
  });
});
