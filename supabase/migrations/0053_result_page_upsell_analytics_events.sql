-- DTC result-page conversion panel events (docs/design/DTC_RESULT_PAGE.md,
-- src/lib/analytics/events.ts) were added to the TypeScript event registry
-- and are fired from ProfessionalReportUpsell.tsx, but no migration ever
-- widened analytics_events_event_type_check to allow them — 0044 was the
-- last migration to touch this constraint and predates these three event
-- types. Every insert of these types has been failing with 23514 (silently
-- swallowed by recordEvent's try/catch) since the panel shipped. Purely
-- additive — widens the event_type check constraint only; no existing
-- row's event_type value is affected.
--
-- Idempotent, same "drop if exists then unconditional add" pattern as
-- 0030/0042/0044 — rerunning this file is always safe.

alter table analytics_events drop constraint if exists analytics_events_event_type_check;
alter table analytics_events add constraint analytics_events_event_type_check
  check (event_type in (
    'basic_dtc_search',
    'unknown_dtc_search',
    'ai_diagnosis_cta_viewed',
    'ai_diagnosis_cta_clicked',
    'ai_diagnosis_started',
    'ai_diagnosis_completed',
    'ai_diagnosis_failed',
    'upgrade_prompt_viewed',
    'landing_consultation_started',
    'landing_prompt_selected',
    'public_intake_question_submitted',
    'public_intake_basic_result_viewed',
    'import_vehicle_scan_clicked',
    'signin_from_intake_clicked',
    'diagnostic_case_created_from_intake',
    'dtc_technician_opened',
    'dtc_technician_closed',
    'guided_diagnosis_clicked',
    'locked_feature_viewed',
    'upgrade_from_consultation_clicked',
    'continue_previous_diagnosis_clicked',
    'diagnostic_report_viewed',
    'diagnostic_report_section_opened',
    'diagnostic_report_filter_changed',
    'diagnostic_report_test_checked',
    'diagnostic_report_test_outcome_changed',
    'diagnostic_report_progress_saved',
    'diagnostic_report_save_failed',
    'diagnostic_report_note_added',
    'diagnostic_report_finding_reviewed',
    'diagnostic_report_cause_status_changed',
    'diagnostic_report_copy_clicked',
    'diagnostic_report_print_clicked',
    'diagnostic_report_completed',
    'one_time_report_offer_viewed',
    'one_time_report_checkout_started',
    'one_time_report_checkout_failed',
    'one_time_report_checkout_returned',
    'one_time_report_credit_granted',
    'one_time_report_case_started',
    'one_time_report_credit_consumed',
    'one_time_report_followup_limit_reached',
    'professional_report_upsell_viewed',
    'professional_report_cta_clicked',
    'pro_plan_cta_clicked'
  ));
