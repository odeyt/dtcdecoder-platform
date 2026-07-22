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

// Same gate as bilingual reports today (a secondary language IS what makes
// a report bilingual) — kept as its own named function since the account
// preferences form gates the "secondary language" field independently of
// the report-mode toggle.
export function canSelectSecondaryLanguage(plan: SubscriptionPlan): boolean {
  return plan === "pro" || plan === "workshop";
}

export function canUseMultilingualReports(plan: SubscriptionPlan): boolean {
  return plan === "workshop";
}

// Free plan gets temporary, unsaved language switching only (client-side/
// cookie, not persisted) — no saved account language at all. Paid plans get
// a permanent, cross-device preference. Tightened from an earlier "everyone
// can save" draft once the actual free/paid boundary was specified; nothing
// shipped depended on the looser version since the preferences page this
// gates didn't exist yet.
export function canSaveLanguagePreferences(plan: SubscriptionPlan): boolean {
  return plan === "pro" || plan === "workshop";
}

export function canSaveAiReportLocale(plan: SubscriptionPlan): boolean {
  return plan === "pro" || plan === "workshop";
}

// Saving a *preferred display currency* is a paid feature (free users see
// USD only) — display-only formatting, but still gated per the product's
// free/paid boundary, not a cost-driven gate like the AI ones above.
export function canSelectDisplayCurrency(plan: SubscriptionPlan): boolean {
  return plan === "pro" || plan === "workshop";
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
