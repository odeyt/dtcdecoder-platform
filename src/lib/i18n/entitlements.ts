// Multilingual plan entitlements. Mirrors the config-object pattern in
// src/lib/pricing.ts (PAID_PLANS) — a single source of truth checked both
// for UI gating and, non-negotiably, at every actual mutation point
// (preferences save, report save, the AI route's outputLocale handling).
// A disabled UI control is not enforcement; every function here must be
// called server-side wherever it matters.
import type { ReportMode, SubscriptionPlan } from "@/lib/types";

// Interface-language switching costs nothing extra (it's static UI copy),
// so it's available to every signed-in user — the actual choice is still
// bounded by which locales are enabled in the registry.
export function canSelectDefaultLanguage(_plan: SubscriptionPlan): boolean {
  return true;
}

// AI report output in a non-English language costs a real second
// (translation) Claude call per query — reserved for paid plans.
export function canSelectAiReportLanguage(plan: SubscriptionPlan): boolean {
  return plan === "pro" || plan === "workshop";
}

export function canUseBilingualReports(plan: SubscriptionPlan): boolean {
  return plan === "pro" || plan === "workshop";
}

export function canUseMultilingualReports(plan: SubscriptionPlan): boolean {
  return plan === "workshop";
}

// Everyone can save their interface language; saving an AI report/secondary
// language specifically is gated separately below since only paid plans
// can act on it.
export function canSaveLanguagePreferences(_plan: SubscriptionPlan): boolean {
  return true;
}

export function canSaveAiReportLocale(plan: SubscriptionPlan): boolean {
  return plan === "pro" || plan === "workshop";
}

// Display currency is formatting only (no real conversion, no checkout
// currency change) — free to offer to every plan.
export function canSelectDisplayCurrency(_plan: SubscriptionPlan): boolean {
  return true;
}

// No PDF/report-export feature exists anywhere in this app yet — DTC pages
// link to external Gumroad PDFs/YouTube, there is no platform-generated
// export. Hardcoded false for every plan so nothing in this pass builds UI
// implying a capability that doesn't exist yet.
export function canExportLocalizedReports(_plan: SubscriptionPlan): boolean {
  return false;
}

// Canonical English always counts as one of these "slots."
export function maxReportLanguages(plan: SubscriptionPlan): number {
  switch (plan) {
    case "workshop":
      return 3;
    case "pro":
      return 2;
    default:
      return 0;
  }
}

export function allowedReportModes(plan: SubscriptionPlan): ReportMode[] {
  if (plan === "workshop") return ["single", "bilingual", "multilingual"];
  if (plan === "pro") return ["single", "bilingual"];
  return ["single"];
}

export function canUseReportMode(plan: SubscriptionPlan, mode: ReportMode): boolean {
  return allowedReportModes(plan).includes(mode);
}
