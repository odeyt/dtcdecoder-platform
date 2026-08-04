import { describe, expect, it } from "vitest";
import { formatRegionCurrency, formatRegionNumber, formatRegionDate, formatRegionDateTime } from "@/lib/region/region-format";
import { LAOS, THAILAND, GLOBAL } from "@/lib/region/region-profile";

describe("formatRegionCurrency", () => {
  it("formats using each region's own currency code — never a hardcoded symbol table", () => {
    // Exact glyph/grouping can vary slightly across ICU data versions —
    // assert the currency actually used, not a pixel-exact string.
    expect(formatRegionCurrency(150000, LAOS)).toMatch(/LAK|₭/);
    expect(formatRegionCurrency(2500, THAILAND)).toMatch(/THB|฿/);
    expect(formatRegionCurrency(25, GLOBAL)).toMatch(/USD|\$/);
  });

  it("never converts the amount — it formats exactly the number given", () => {
    const formatted = formatRegionCurrency(6.99, GLOBAL);
    expect(formatted).toContain("6.99");
  });
});

describe("formatRegionNumber", () => {
  it("formats a plain number per the region's numberFormat locale tag", () => {
    expect(formatRegionNumber(1234, GLOBAL)).toBe("1,234");
  });
});

describe("formatRegionDate / formatRegionDateTime", () => {
  const fixedDate = new Date(Date.UTC(2026, 7, 4, 12, 0, 0)); // 2026-08-04T12:00:00Z

  it("renders in the region's timezone without throwing, for every registered region", () => {
    for (const region of [LAOS, THAILAND, GLOBAL]) {
      expect(() => formatRegionDate(fixedDate, region)).not.toThrow();
      expect(() => formatRegionDateTime(fixedDate, region)).not.toThrow();
      expect(formatRegionDate(fixedDate, region).length).toBeGreaterThan(0);
    }
  });

  it("always uses the Gregorian calendar, even for th-TH (whose locale default is Buddhist Era)", () => {
    const formatted = formatRegionDate(fixedDate, THAILAND);
    // Buddhist-Era Thai output would show 2569 (2026 + 543); Gregorian
    // output shows 2026. Asserting the real Gregorian year is present is a
    // direct regression check for the calendar:"gregory" override.
    expect(formatted).toContain("2026");
    expect(formatted).not.toContain("2569");
  });

  it("Bangkok and Vientiane agree on local time (both UTC+7), from Intl's real offset data — not manual math", () => {
    const bangkok = formatRegionDateTime(fixedDate, THAILAND);
    const vientiane = formatRegionDateTime(fixedDate, LAOS);
    // Punctuation conventions differ between th-TH and lo-LA (comma vs. no
    // comma before the time), so compare the actual local time rendered,
    // not the full locale-formatted string. Both zones are UTC+7 today —
    // this only stays true because Intl (not this code) owns the offset.
    expect(bangkok).toContain("19:00");
    expect(vientiane).toContain("19:00");
  });
});
