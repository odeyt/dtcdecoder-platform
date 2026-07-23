// Single source of truth for plan pricing, token limits, and the yearly
// discount — used by both the pricing page UI and the checkout/rate-limit
// server logic, so the displayed price and the actual charge never drift.

export type BillingInterval = "monthly" | "yearly";

export const YEARLY_FLAT_DISCOUNT_USD = 30;

export const PAID_PLANS = {
  pro: {
    label: "Pro Technician",
    monthlyPriceUsd: 19,
    // Monthly token budgets are a deliberate safety valve, not a hard "fair
    // use" promise advertised to the customer — generous enough that no
    // real technician hits it in normal use, bounded enough that a script
    // hammering the endpoint can't run up unbounded Claude API spend.
    monthlyTokenLimit: 500_000,
  },
  workshop: {
    label: "Workshop",
    monthlyPriceUsd: 49,
    monthlyTokenLimit: 2_000_000,
  },
} as const;

export type PaidPlan = keyof typeof PAID_PLANS;

export function yearlyPriceUsd(plan: PaidPlan): number {
  return PAID_PLANS[plan].monthlyPriceUsd * 12 - YEARLY_FLAT_DISCOUNT_USD;
}

export function effectiveMonthlyPriceUsd(plan: PaidPlan, interval: BillingInterval): number {
  if (interval === "monthly") return PAID_PLANS[plan].monthlyPriceUsd;
  return yearlyPriceUsd(plan) / 12;
}

// Diagnostic Scan Report Analysis entitlement limits. A separate map from
// PAID_PLANS because the free plan needs a limit here too (PAID_PLANS only
// covers pro/workshop pricing). See src/lib/scan-diagnostics/entitlements.ts
// for the functions that read this.
export const SCAN_DIAGNOSTIC_LIMITS = {
  free: { monthlyAnalyses: 2, fullExport: false, feedbackHistory: false },
  pro: { monthlyAnalyses: 25, fullExport: true, feedbackHistory: false },
  workshop: { monthlyAnalyses: 100, fullExport: true, feedbackHistory: true },
} as const;
