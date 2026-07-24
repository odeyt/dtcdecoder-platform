import { describe, expect, it } from "vitest";
import { PAID_PLANS, YEARLY_FLAT_DISCOUNT_USD, yearlyPriceUsd, effectiveMonthlyPriceUsd } from "@/lib/pricing";

// Pins the exact numbers the entitlement spec worked out by hand:
// Pro:      $19 x 12 = $228, $228 - $198 = $30 savings
// Workshop: $49 x 12 = $588, $588 - $558 = $30 savings
describe("yearly pricing math", () => {
  it("Pro: $19/mo, $198/yr, exactly $30 saved vs. paying monthly all year", () => {
    expect(PAID_PLANS.pro.monthlyPriceUsd).toBe(19);
    expect(yearlyPriceUsd("pro")).toBe(198);
    expect(PAID_PLANS.pro.monthlyPriceUsd * 12 - yearlyPriceUsd("pro")).toBe(30);
    expect(YEARLY_FLAT_DISCOUNT_USD).toBe(30);
  });

  it("Workshop: $49/mo, $558/yr, exactly $30 saved vs. paying monthly all year", () => {
    expect(PAID_PLANS.workshop.monthlyPriceUsd).toBe(49);
    expect(yearlyPriceUsd("workshop")).toBe(558);
    expect(PAID_PLANS.workshop.monthlyPriceUsd * 12 - yearlyPriceUsd("workshop")).toBe(30);
  });

  it("effective monthly price under yearly billing matches the ~$16.50 / ~$46.50 the pricing page advertises", () => {
    expect(effectiveMonthlyPriceUsd("pro", "yearly")).toBeCloseTo(16.5, 2);
    expect(effectiveMonthlyPriceUsd("workshop", "yearly")).toBeCloseTo(46.5, 2);
  });

  it("effective monthly price under monthly billing is just the sticker price", () => {
    expect(effectiveMonthlyPriceUsd("pro", "monthly")).toBe(19);
    expect(effectiveMonthlyPriceUsd("workshop", "monthly")).toBe(49);
  });
});
