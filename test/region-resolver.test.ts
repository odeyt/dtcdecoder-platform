import { describe, expect, it } from "vitest";
import { resolveRegion } from "@/lib/region/region-resolver";

describe("resolveRegion — priority chain", () => {
  it("falls back to GLOBAL when nothing is provided", () => {
    const result = resolveRegion({});
    expect(result.profile.id).toBe("GLOBAL");
    expect(result.source).toBe("global_fallback");
  });

  it("resolves by browser locale when only that is provided", () => {
    const th = resolveRegion({ browserLocale: "th-TH" });
    expect(th.profile.id).toBe("TH");
    expect(th.source).toBe("browser_locale");

    const lo = resolveRegion({ browserLocale: "lo" });
    expect(lo.profile.id).toBe("LA");
    expect(lo.source).toBe("browser_locale");
  });

  it("does not match a browser locale with no corresponding profile default language", () => {
    // "en" is only GLOBAL's defaultLanguage would match — but GLOBAL is
    // never matched here since it's the fallback tier, so "fr" resolves to
    // the country tier or the final GLOBAL fallback, not a false positive.
    const result = resolveRegion({ browserLocale: "fr-FR" });
    expect(result.source).toBe("global_fallback");
  });

  it("does not match on a profile's SECONDARY supported language — only its default", () => {
    // Both Laos and Thailand list "en" as a secondary supported language;
    // an "en" browser locale must not ambiguously pick one of them.
    const result = resolveRegion({ browserLocale: "en-US" });
    expect(result.profile.id).toBe("GLOBAL");
  });

  it("never reports GLOBAL as a browser_locale match, even though GLOBAL's own defaultLanguage is 'en'", () => {
    // Regression: an "en" browser locale ending up at GLOBAL is correct,
    // but it must arrive there via global_fallback, not browser_locale —
    // "browser_locale" is supposed to mean "matched a specific country,"
    // and RegionGeoBanner only offers to switch when it sees that source.
    // Asserting profile.id alone here previously let this slip through,
    // since both a real match and the fallback land on the same profile.
    const result = resolveRegion({ browserLocale: "en-US" });
    expect(result.source).toBe("global_fallback");
  });

  it("resolves by country hint when browser locale doesn't match anything", () => {
    const result = resolveRegion({ browserLocale: "fr-FR", countryCodeHint: "LA" });
    expect(result.profile.id).toBe("LA");
    expect(result.source).toBe("country");
  });

  it("profile setting (e.g. an anonymous cookie choice) outranks browser locale and country", () => {
    const result = resolveRegion({
      profileSettingRegionId: "TH",
      browserLocale: "lo",
      countryCodeHint: "LA",
    });
    expect(result.profile.id).toBe("TH");
    expect(result.source).toBe("profile_setting");
  });

  it("saved user preference outranks everything else", () => {
    const result = resolveRegion({
      userPreferenceRegionId: "GLOBAL",
      profileSettingRegionId: "TH",
      browserLocale: "lo",
      countryCodeHint: "LA",
    });
    expect(result.profile.id).toBe("GLOBAL");
    expect(result.source).toBe("user_preference");
  });

  it("skips an unrecognized user preference and falls through the rest of the chain", () => {
    const result = resolveRegion({
      userPreferenceRegionId: "NOT_A_REAL_REGION",
      browserLocale: "th",
    });
    expect(result.profile.id).toBe("TH");
    expect(result.source).toBe("browser_locale");
  });

  it("skips an unrecognized profile-setting cookie the same way", () => {
    const result = resolveRegion({
      profileSettingRegionId: "NOT_A_REAL_REGION",
      countryCodeHint: "TH",
    });
    expect(result.profile.id).toBe("TH");
    expect(result.source).toBe("country");
  });
});
