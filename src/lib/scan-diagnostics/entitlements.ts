// Diagnostic Scan Report Analysis plan entitlements. Mirrors the
// config-object pattern in src/lib/i18n/entitlements.ts — a single source
// of truth checked both for UI gating and, non-negotiably, at every actual
// mutation point (analyze route usage check, report export button, feedback
// history route). A disabled UI control is not enforcement; every function
// here must be called server-side wherever it matters.
import { SCAN_DIAGNOSTIC_LIMITS } from "@/lib/pricing";
import type { SubscriptionPlan } from "@/lib/types";

export function scanMonthlyLimit(plan: SubscriptionPlan): number {
  return SCAN_DIAGNOSTIC_LIMITS[plan].monthlyAnalyses;
}

export function canExportScanReport(plan: SubscriptionPlan): boolean {
  return SCAN_DIAGNOSTIC_LIMITS[plan].fullExport;
}

export function canViewScanFeedbackHistory(plan: SubscriptionPlan): boolean {
  return SCAN_DIAGNOSTIC_LIMITS[plan].feedbackHistory;
}
