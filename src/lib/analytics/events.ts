// Minimal product-analytics recorder for the DTC search -> paid AI
// diagnosis funnel (migration 0027_analytics_events.sql). Deliberately not
// the AI usage/cost ledgers (src/lib/ai-diagnostics/usage.ts) — this is
// funnel observability only and never gates anything. Best-effort: a
// logging failure must never break the request it's attached to.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export const ANALYTICS_EVENT_TYPES = [
  "basic_dtc_search",
  "unknown_dtc_search",
  "ai_diagnosis_cta_viewed",
  "ai_diagnosis_cta_clicked",
  "ai_diagnosis_started",
  "ai_diagnosis_completed",
  "ai_diagnosis_failed",
  "upgrade_prompt_viewed",
  // Phase 1 DTC Technician funnel (docs/PHASE_1_DTC_TECHNICIAN_ARCHITECTURE.md,
  // migration 0030) — landing/public-intake/consultation-shell events.
  "landing_consultation_started",
  "landing_prompt_selected",
  "public_intake_question_submitted",
  "public_intake_basic_result_viewed",
  "import_vehicle_scan_clicked",
  "signin_from_intake_clicked",
  "diagnostic_case_created_from_intake",
  "dtc_technician_opened",
  "dtc_technician_closed",
  "guided_diagnosis_clicked",
  "locked_feature_viewed",
  "upgrade_from_consultation_clicked",
  // Digital Service Bay hero (homepage) — one entry per welcome-card path,
  // not covered by the existing landing/consultation funnel events above.
  "continue_previous_diagnosis_clicked",
  // Diagnostic Workbench (docs/DIAGNOSTIC_WORKBENCH_ARCHITECTURE.md,
  // migration 0042) — the redesigned scan-report result page.
  "diagnostic_report_viewed",
  "diagnostic_report_section_opened",
  "diagnostic_report_filter_changed",
  "diagnostic_report_test_checked",
  "diagnostic_report_test_outcome_changed",
  "diagnostic_report_progress_saved",
  "diagnostic_report_save_failed",
  "diagnostic_report_note_added",
  "diagnostic_report_finding_reviewed",
  "diagnostic_report_cause_status_changed",
  "diagnostic_report_copy_clicked",
  "diagnostic_report_print_clicked",
  "diagnostic_report_completed",
  // Professional Diagnostic Report one-time-purchase funnel
  // (docs/billing/ONE_TIME_PROFESSIONAL_REPORT.md). Metadata stays limited
  // to plan/product-key/reason tags — never VIN, symptoms, scan contents,
  // email, payment details, or report text.
  "one_time_report_offer_viewed",
  "one_time_report_checkout_started",
  "one_time_report_checkout_failed",
  "one_time_report_checkout_returned",
  "one_time_report_credit_granted",
  "one_time_report_case_started",
  "one_time_report_credit_consumed",
  "one_time_report_followup_limit_reached",

  // DTC result-page conversion panel (docs/design/DTC_RESULT_PAGE.md).
  // Fired from ProfessionalReportUpsell, which replaced nine locked
  // placeholder cards and their nine separate upgrade buttons — these
  // three events are what make it possible to tell whether the
  // consolidated panel converts better than that grid did.
  //
  // No metadata is attached at these call sites: the DTC code, the
  // visitor's symptoms, and their plan are all deliberately left out, in
  // line with the same-file rule above.
  "professional_report_upsell_viewed",
  "professional_report_cta_clicked",
  "pro_plan_cta_clicked",
] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export function isAnalyticsEventType(value: unknown): value is AnalyticsEventType {
  return typeof value === "string" && (ANALYTICS_EVENT_TYPES as readonly string[]).includes(value);
}

// `metadata` must stay small, structured, non-sensitive tags (a plan name,
// a DTC code family letter, a source page) — never symptoms, VIN, freeform
// complaint text, or any AI-generated diagnostic content. Callers are
// responsible for that; this function does not attempt to sanitize it.
export async function recordEvent(
  eventType: AnalyticsEventType,
  params: { userId?: string | null; metadata?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("analytics_events").insert({
      user_id: params.userId ?? null,
      event_type: eventType,
      metadata: params.metadata ?? {},
    });
    if (error) console.error("[analytics] failed to record event", eventType, error);
  } catch (err) {
    console.error("[analytics] failed to record event", eventType, err);
  }
}
