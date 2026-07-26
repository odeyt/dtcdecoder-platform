import { describe, expect, it } from "vitest";
import {
  PAID_PLANS,
  yearlyPriceUsd,
  yearlySavingsUsd,
  effectiveMonthlyPriceUsd,
  AI_DIAGNOSTIC_ENTITLEMENTS,
  BASIC_SEARCH_LIMITS,
} from "@/lib/pricing";

// Pins the exact numbers from docs/PRICING_AND_AI_COST_AUDIT.md's target
// plan structure. Yearly prices are stored explicitly per plan now (not a
// shared flat discount) — Pro saves $78/yr, Workshop saves $198/yr.
describe("yearly pricing math", () => {
  it("Pro: $39/mo, $390/yr, $78 saved vs. paying monthly all year", () => {
    expect(PAID_PLANS.pro.monthlyPriceUsd).toBe(39);
    expect(yearlyPriceUsd("pro")).toBe(390);
    expect(yearlySavingsUsd("pro")).toBe(78);
  });

  it("Workshop: $99/mo, $990/yr, $198 saved vs. paying monthly all year", () => {
    expect(PAID_PLANS.workshop.monthlyPriceUsd).toBe(99);
    expect(yearlyPriceUsd("workshop")).toBe(990);
    expect(yearlySavingsUsd("workshop")).toBe(198);
  });

  it("effective monthly price under yearly billing matches what the pricing page advertises", () => {
    expect(effectiveMonthlyPriceUsd("pro", "yearly")).toBeCloseTo(32.5, 2);
    expect(effectiveMonthlyPriceUsd("workshop", "yearly")).toBeCloseTo(82.5, 2);
  });

  it("effective monthly price under monthly billing is just the sticker price", () => {
    expect(effectiveMonthlyPriceUsd("pro", "monthly")).toBe(39);
    expect(effectiveMonthlyPriceUsd("workshop", "monthly")).toBe(99);
  });
});

describe("AI_DIAGNOSTIC_ENTITLEMENTS — free receives no runtime AI diagnostic calls", () => {
  it("free has zero AI allowance across every dimension", () => {
    const free = AI_DIAGNOSTIC_ENTITLEMENTS.free;
    expect(free.aiDiagnosticPreviewDailyLimit).toBe(0);
    expect(free.fullDiagnosticMonthlyLimit).toBe(0);
    expect(free.fullDiagnosticDailyLimit).toBe(0);
  });

  it("pro and workshop match the new target quotas", () => {
    expect(AI_DIAGNOSTIC_ENTITLEMENTS.pro.fullDiagnosticMonthlyLimit).toBe(20);
    expect(AI_DIAGNOSTIC_ENTITLEMENTS.pro.fullDiagnosticDailyLimit).toBe(3);
    expect(AI_DIAGNOSTIC_ENTITLEMENTS.workshop.fullDiagnosticMonthlyLimit).toBe(75);
    expect(AI_DIAGNOSTIC_ENTITLEMENTS.workshop.fullDiagnosticDailyLimit).toBe(8);
    expect(AI_DIAGNOSTIC_ENTITLEMENTS.workshop.technicianSeatLimit).toBe(3);
  });
});

describe("BASIC_SEARCH_LIMITS", () => {
  it("caps free at 3/day and 10/month; paid plans are unlimited", () => {
    expect(BASIC_SEARCH_LIMITS.free).toEqual({ dailyLimit: 3, monthlyLimit: 10 });
    expect(BASIC_SEARCH_LIMITS.pro).toEqual({ dailyLimit: null, monthlyLimit: null });
    expect(BASIC_SEARCH_LIMITS.workshop).toEqual({ dailyLimit: null, monthlyLimit: null });
  });
});
