// Diagnostic Scan Report Analysis plan entitlements. Thin wrappers over the
// canonical shared registry in src/lib/ai-diagnostics/entitlements.ts — this
// file exists only to keep the scan-diagnostics call sites unchanged
// (scanMonthlyLimit/canExportScanReport/canViewScanFeedbackHistory), not as
// a second source of truth. A disabled UI control is not enforcement; every
// function here must be called server-side wherever it matters.
import { fullMonthlyLimit, canExportPdf, accessLevelForPlan } from "@/lib/ai-diagnostics/entitlements";
import type { SubscriptionPlan } from "@/lib/types";

export function scanMonthlyLimit(plan: SubscriptionPlan): number {
  return fullMonthlyLimit(plan);
}

export function canExportScanReport(plan: SubscriptionPlan): boolean {
  return canExportPdf(plan);
}

// Feedback-history aggregation is a Workshop-only convenience view (not part
// of the canonical AI-diagnostic entitlement shape) — kept as its own flag
// here rather than folded into the shared registry, since it has nothing to
// do with AI usage/redaction.
export function canViewScanFeedbackHistory(plan: SubscriptionPlan): boolean {
  return plan === "workshop";
}

// Whether a currently-viewed scan report should be served in full or
// redacted to a preview — always derived from the CURRENT plan, not the
// plan at the time the report was generated (an upgrade retroactively
// unlocks previously-generated reports).
export function canViewFullScanReport(plan: SubscriptionPlan): boolean {
  return accessLevelForPlan(plan) === "full";
}
