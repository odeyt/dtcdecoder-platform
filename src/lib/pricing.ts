// Single source of truth for plan pricing, AI diagnostic entitlements, basic-
// search limits, diagnostic-credit weights, and cost guards — used by both
// the pricing page UI and the checkout/entitlement/cost-control server
// logic, so the displayed price/limits and the actual enforcement never
// drift. See docs/PRICING_AND_AI_COST_AUDIT.md for the rationale behind
// this registry's shape.

import type { SubscriptionPlan } from "@/lib/types";

export type BillingInterval = "monthly" | "yearly";

// Yearly prices are stored explicitly per plan, not derived from a flat
// discount — Pro saves $78/yr, Workshop saves $198/yr, not a shared amount
// (unlike the previous $19/$49 pricing, which did share a flat $30
// discount). Do not reintroduce a shared-constant formula here.
export const PAID_PLANS = {
  pro: {
    label: "Pro Technician",
    monthlyPriceUsd: 39,
    yearlyPriceUsd: 390,
  },
  workshop: {
    label: "Workshop",
    monthlyPriceUsd: 99,
    yearlyPriceUsd: 990,
  },
} as const;

export type PaidPlan = keyof typeof PAID_PLANS;

export function yearlyPriceUsd(plan: PaidPlan): number {
  return PAID_PLANS[plan].yearlyPriceUsd;
}

export function yearlySavingsUsd(plan: PaidPlan): number {
  return PAID_PLANS[plan].monthlyPriceUsd * 12 - PAID_PLANS[plan].yearlyPriceUsd;
}

export function effectiveMonthlyPriceUsd(plan: PaidPlan, interval: BillingInterval): number {
  if (interval === "monthly") return PAID_PLANS[plan].monthlyPriceUsd;
  return yearlyPriceUsd(plan) / 12;
}

// Optional, temporary introductory pricing — display-only, never changes
// the canonical list price above or what Creem actually charges (checkout
// still uses the real product price). LAUNCH_PRICING_ACTIVE is the single
// switch; flip it in one place, not per-component. See
// docs/PRICING_AND_AI_COST_AUDIT.md open question #4 — until a discounted
// Creem product/price actually exists, this stays display-only and
// unwired from checkout, not "fake" (never advertise a price the site
// can't actually charge).
//
// BEFORE setting this to true: update the Pro/Workshop Creem product's
// actual configured monthly price to LAUNCH_PRICING's value first (in the
// Creem dashboard, not here — this app never sends a per-checkout price
// override, see createSubscriptionCheckout in src/lib/payments/creem.ts).
// Flipping this flag alone changes only what the pricing page DISPLAYS;
// checkout still charges whatever the linked Creem product is actually
// configured to charge.
export const LAUNCH_PRICING_ACTIVE = false;

export const LAUNCH_PRICING = {
  pro: { monthlyPriceUsd: 29 },
  workshop: { monthlyPriceUsd: 79 },
} as const;

// Enterprise is a contracted/negotiated tier (custom pricing, custom
// volume, API access) — not a self-serve checkout plan. Deliberately NOT
// added to SubscriptionPlan/the subscription_plan DB enum yet: there is no
// Creem product, no self-serve flow, and no concrete feature backing (API
// access, custom glossary, org localization, usage analytics all remain
// unbuilt). This constant exists only so pricing-page copy has one place
// to read "contact us" content from, not to represent a real, assignable
// plan value. Promote to a real SubscriptionPlan value only once an actual
// contracted customer needs one.
export const ENTERPRISE_TIER = {
  label: "Enterprise",
  priceLabel: "Custom pricing",
  bullets: [
    "Contracted report volume",
    "Additional users",
    "API access",
    "Custom glossary",
    "Organization localization",
    "Usage analytics",
    "Negotiated overages",
  ],
} as const;

// Canonical AI-diagnostic entitlement shape shared by both AI features
// ("DTC Assistant" chat and "Scan Report Analysis"). This is the ONLY
// registry of AI usage limits in the codebase — pricing UI, account page,
// server-side usage enforcement (src/lib/ai-diagnostics/*), and both
// features' entitlement wrappers all read this, so a limit changed here is
// changed everywhere at once.
//
// Free receives NO runtime AI diagnostic calls at all (primary product
// decision, docs/PRICING_AND_AI_COST_AUDIT.md §6.2) — every field below is
// 0 for free, not a small nonzero preview allowance like the previous
// model. Free-tier "preview" UI is static, pre-written example content,
// never a per-request AI generation.
//
// - fullDiagnosticMonthlyLimit / fullDiagnosticDailyLimit: paid-tier full
//   AI diagnostic reports (credit-weighted — see DIAGNOSTIC_CREDIT_WEIGHTS
//   — a "report" here is 1 standard-report credit's worth of allowance,
//   not a hard cap on operation count).
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
    aiDiagnosticPreviewDailyLimit: 0,
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
    fullDiagnosticMonthlyLimit: 20,
    fullDiagnosticDailyLimit: 3,
    technicianSeatLimit: 1,
    pdfExport: true,
    sharedCases: false,
    prioritySupport: false,
  },
  workshop: {
    basicDtcLookup: true,
    aiDiagnosticPreviewDailyLimit: null,
    fullDiagnosticMonthlyLimit: 75,
    fullDiagnosticDailyLimit: 8,
    technicianSeatLimit: 3,
    pdfExport: true,
    sharedCases: false,
    prioritySupport: false,
  },
};

// Basic (non-AI) DTC search — interactive, free-text/fuzzy search only
// (src/lib/dtc.ts's searchDtcCodes()), never a direct /dtc/[code] page
// view. Only Free is capped; paid plans have no basic-search limit
// (`null` = unlimited). See docs/AI_USAGE_LIMITS.md and the
// basic_search_usage ledger (migration 0022).
export interface BasicSearchLimits {
  dailyLimit: number | null;
  monthlyLimit: number | null;
}

export const BASIC_SEARCH_LIMITS: Record<SubscriptionPlan, BasicSearchLimits> = {
  free: { dailyLimit: 3, monthlyLimit: 10 },
  pro: { dailyLimit: null, monthlyLimit: null },
  workshop: { dailyLimit: null, monthlyLimit: null },
};

// Internal diagnostic-credit weights, tracked in the AI cost ledger
// (ai_diagnostic_runs.credits_consumed — migration 0023) purely for cost
// observability and, once add-on packs exist, add-on-credit consumption.
// The customer-facing fullDiagnosticMonthlyLimit/fullDiagnosticDailyLimit
// above stay a flat report count, enforced by ai_diagnostic_usage exactly
// as before (1 reservation = 1 unit against the limit, regardless of
// operation type) — a follow-up or extra language never fractionally
// debits a plan's included report allowance. Never expose these numbers as
// "credits" in customer-facing copy unless explicitly asked — the product
// decision is to keep saying "reports."
export const DIAGNOSTIC_CREDIT_WEIGHTS = {
  standardReport: 1,
  longScannerReport: 2,
  additionalReviewer: 1,
  additionalLanguage: 0.5,
  majorRegeneration: 1,
  followUpRound: 0.5,
} as const;

export type DiagnosticCreditOperation = keyof typeof DIAGNOSTIC_CREDIT_WEIGHTS;

// Operational cost targets — internal guardrails for the cost-estimation/
// guard pipeline, never marketing claims. See docs/PRICING_AND_AI_COST_AUDIT.md
// §6.4.
export const COST_GUARDS = {
  targetAverageReportCostUsd: 0.5,
  warningThresholdUsd: 0.75,
  hardCeilingUsd: 1.5,
  targetGrossMarginPct: 80,
} as const;

// Optional add-on report packs, consumed only after a plan's included
// monthly allowance is exhausted (never before, never silently recurring
// unless explicitly sold as a subscription). Checkout for these stays
// disabled until real Creem product IDs exist for each pack — see
// docs/PAYMENT_PLAN_MAPPING.md for the established pattern of gating
// checkout behind configured product IDs rather than a code flag.
export interface AddOnPack {
  id: string;
  reports: number;
  priceUsd: number;
}

export const ADD_ON_PACKS: readonly AddOnPack[] = [
  { id: "addon-10", reports: 10, priceUsd: 15 },
  { id: "addon-25", reports: 25, priceUsd: 30 },
  { id: "addon-50", reports: 50, priceUsd: 55 },
];
