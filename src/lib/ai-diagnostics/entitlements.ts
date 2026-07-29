// Canonical AI-diagnostic entitlement reader, shared by both AI features
// ("DTC Assistant" chat and "Scan Report Analysis"). Reads the single
// AI_DIAGNOSTIC_ENTITLEMENTS registry in src/lib/pricing.ts — no feature
// should define its own copy of these numbers. A disabled UI control is not
// enforcement; every function here must also be checked server-side at the
// actual generation point (src/lib/ai-diagnostics/usage.ts).
import { AI_DIAGNOSTIC_ENTITLEMENTS, type AiDiagnosticEntitlements } from "@/lib/pricing";
import type { SubscriptionPlan } from "@/lib/types";

export function getEntitlements(plan: SubscriptionPlan): AiDiagnosticEntitlements {
  return AI_DIAGNOSTIC_ENTITLEMENTS[plan];
}

// Whether this plan ever receives a full (unredacted) AI diagnostic result.
// Free is always preview-only, regardless of remaining daily allowance.
export function canAccessFullDiagnostics(plan: SubscriptionPlan): boolean {
  return AI_DIAGNOSTIC_ENTITLEMENTS[plan].fullDiagnosticMonthlyLimit > 0;
}

export function previewDailyLimit(plan: SubscriptionPlan): number | null {
  return AI_DIAGNOSTIC_ENTITLEMENTS[plan].aiDiagnosticPreviewDailyLimit;
}

export function fullDailyLimit(plan: SubscriptionPlan): number | null {
  return AI_DIAGNOSTIC_ENTITLEMENTS[plan].fullDiagnosticDailyLimit;
}

export function fullMonthlyLimit(plan: SubscriptionPlan): number {
  return AI_DIAGNOSTIC_ENTITLEMENTS[plan].fullDiagnosticMonthlyLimit;
}

export function canExportPdf(plan: SubscriptionPlan): boolean {
  return AI_DIAGNOSTIC_ENTITLEMENTS[plan].pdfExport;
}

export function technicianSeatLimit(plan: SubscriptionPlan): number {
  return AI_DIAGNOSTIC_ENTITLEMENTS[plan].technicianSeatLimit;
}

// The access level a given plan resolves to for AI-diagnostic generation —
// the single decision point both features' redaction logic branches on.
export type AiDiagnosticAccessLevel = "preview" | "full";

export function accessLevelForPlan(plan: SubscriptionPlan): AiDiagnosticAccessLevel {
  return canAccessFullDiagnostics(plan) ? "full" : "preview";
}
