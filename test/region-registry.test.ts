import { describe, expect, it } from "vitest";
import {
  REGION_PROFILES,
  DEFAULT_REGION_ID,
  isRecognizedRegionId,
  getRegionProfile,
  listRegionProfiles,
  findRegionByCountryCode,
} from "@/lib/region/region-registry";

describe("region-registry", () => {
  it("registers exactly the three initial profiles", () => {
    expect(Object.keys(REGION_PROFILES).sort()).toEqual(["GLOBAL", "LA", "TH"]);
  });

  it("defaults to GLOBAL", () => {
    expect(DEFAULT_REGION_ID).toBe("GLOBAL");
  });

  it("recognizes registered ids and rejects everything else", () => {
    expect(isRecognizedRegionId("LA")).toBe(true);
    expect(isRecognizedRegionId("TH")).toBe(true);
    expect(isRecognizedRegionId("GLOBAL")).toBe(true);
    expect(isRecognizedRegionId("VN")).toBe(false);
    expect(isRecognizedRegionId(null)).toBe(false);
    expect(isRecognizedRegionId(undefined)).toBe(false);
    expect(isRecognizedRegionId("")).toBe(false);
  });

  it("getRegionProfile falls back to GLOBAL for an unrecognized id", () => {
    expect(getRegionProfile("VN").id).toBe("GLOBAL");
    expect(getRegionProfile(null).id).toBe("GLOBAL");
  });

  it("getRegionProfile returns the exact profile for a recognized id", () => {
    const laos = getRegionProfile("LA");
    expect(laos.name).toBe("Laos");
    expect(laos.currency).toBe("LAK");
    expect(laos.timezone).toBe("Asia/Vientiane");
    expect(laos.defaultLanguage).toBe("lo");

    const thailand = getRegionProfile("TH");
    expect(thailand.name).toBe("Thailand");
    expect(thailand.currency).toBe("THB");
    expect(thailand.timezone).toBe("Asia/Bangkok");
    expect(thailand.defaultLanguage).toBe("th");
  });

  it("lists all registered profiles", () => {
    expect(listRegionProfiles()).toHaveLength(3);
  });

  it("finds a region by its ISO country code, case-insensitively", () => {
    expect(findRegionByCountryCode("TH")?.id).toBe("TH");
    expect(findRegionByCountryCode("th")?.id).toBe("TH");
    expect(findRegionByCountryCode("LA")?.id).toBe("LA");
  });

  it("returns null for a country code with no matching profile (e.g. Global has none)", () => {
    expect(findRegionByCountryCode("VN")).toBeNull();
    expect(findRegionByCountryCode(null)).toBeNull();
    expect(findRegionByCountryCode(undefined)).toBeNull();
  });
});
