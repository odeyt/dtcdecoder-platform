import { describe, expect, it } from "vitest";
import { convertDisplayPrice, formatCurrencyAmount, getDisplayPriceEstimate } from "@/lib/currency";

describe("convertDisplayPrice", () => {
  it("converts using the given rate at the currency's own decimal places", () => {
    expect(convertDisplayPrice(19.99, 0.92, 2)).toBeCloseTo(18.39, 2);
  });

  it("collapses to whole units for a zero-decimal currency (e.g. JPY)", () => {
    expect(convertDisplayPrice(20, 150, 0)).toBe(3000);
  });

  it("rounds rather than truncates", () => {
    // 19.99 * 1.005 = 20.08995 -> rounds to 20.09, not 20.08
    expect(convertDisplayPrice(19.99, 1.005, 2)).toBe(20.09);
  });

  it("handles a rate of 1 as a no-op conversion", () => {
    expect(convertDisplayPrice(19.99, 1, 2)).toBe(19.99);
  });
});

describe("formatCurrencyAmount", () => {
  it("formats USD with 2 decimal places", () => {
    expect(formatCurrencyAmount(19.99, "USD", 2)).toBe("$19.99");
  });

  it("formats a zero-decimal currency without a fractional part", () => {
    const formatted = formatCurrencyAmount(3000, "JPY", 0);
    expect(formatted).not.toMatch(/\.\d/);
    expect(formatted).toContain("3,000");
  });

  it("falls back to a plain 'amount CODE' string for an unrecognized currency code", () => {
    expect(formatCurrencyAmount(19.99, "NOTAREALCODE", 2)).toBe("19.99 NOTAREALCODE");
  });
});

describe("getDisplayPriceEstimate", () => {
  it("returns the USD amount unmodified, marked as not-an-estimate, when currencyCode is USD", async () => {
    const result = await getDisplayPriceEstimate(19.99, "USD", 2);
    expect(result).toEqual({
      currencyCode: "USD",
      formatted: "$19.99",
      isEstimate: false,
      rateSource: null,
      rateEffectiveAt: null,
    });
  });
});
