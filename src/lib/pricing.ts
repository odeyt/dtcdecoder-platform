// Single source of truth for plan pricing, AI diagnostic entitlements, and
// the yearly discount — used by both the pricing page UI and the
// checkout/entitlement server logic, so the displayed price/limits and the
// actual enforcement never drift.

import type { SubscriptionPlan } from "@/lib/types";

export type BillingInterval = "monthly" | "yearly";

export const YEARLY_FLAT_DISCOUNT_USD = 30;

export const PAID_PLANS = {
  pro: {
    label: "Pro Technician",
    monthlyPriceUsd: 19,
  },
  workshop: {
    label: "Workshop",
    monthlyPriceUsd: 49,
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

// Canonical AI-diagnostic entitlement shape shared by both AI features
// ("DTC Assistant" chat and "Scan Report Analysis"). This is the ONLY
// registry of AI usage limits in the codebase — pricing UI, account page,
// server-side usage enforcement (src/lib/ai-diagnostics/*), and both
// features' entitlement wrappers all read this, so a limit changed here is
// changed everywhere at once.
//
// - aiDiagnosticPreviewDailyLimit: free-tier redacted previews per day.
//   `null` on paid plans (they don't consume the preview counter at all —
//   they get full reports instead, gated below).
// - fullDiagnosticMonthlyLimit / fullDiagnosticDailyLimit: paid-tier full
//   (unredacted) AI diagnostic reports. Free is 0/0 — free never gets a
//   full report, only previews.
// - technicianSeatLimit / sharedCases: Workshop's multi-seat entitlement is
//   modeled here for pricing/display honesty, but no invite or shared-login
//   mechanism is implemented yet — see docs/PRICING_AND_ENTITLEMENTS.md.
// - prioritySupport: only ever true once the business actually provides it.
export interface AiDiagnosticEntitlements {
  basicDtcLookup: boolean;
  aiDiagnosticPreviewDailyLimit: number | null;
  fullDiagnosticMonthlyLimit: number;
  fullDiagnosticDailyLimit: number;
  technicianSeatLimit: number;
  pdfExport: boolean;
  sharedCases: boolean;
  prioritySupport: boolean;
}

export const AI_DIAGNOSTIC_ENTITLEMENTS: Record<SubscriptionPlan, AiDiagnosticEntitlements> = {
  free: {
    basicDtcLookup: true,
    aiDiagnosticPreviewDailyLimit: 2,
    fullDiagnosticMonthlyLimit: 0,
    fullDiagnosticDailyLimit: 0,
    technicianSeatLimit: 1,
    pdfExport: false,
    sharedCases: false,
    prioritySupport: false,
  },
  pro: {
    basicDtcLookup: true,
    aiDiagnosticPreviewDailyLimit: null,
    fullDiagnosticMonthlyLimit: 30,
    fullDiagnosticDailyLimit: 5,
    technicianSeatLimit: 1,
    pdfExport: true,
    sharedCases: false,
    prioritySupport: false,
  },
  workshop: {
    basicDtcLookup: true,
    aiDiagnosticPreviewDailyLimit: null,
    fullDiagnosticMonthlyLimit: 120,
    fullDiagnosticDailyLimit: 15,
    technicianSeatLimit: 3,
    pdfExport: true,
    sharedCases: false,
    prioritySupport: false,
  },
};
