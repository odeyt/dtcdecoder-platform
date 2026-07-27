-- Phase 1 DTC Technician experience (docs/PHASE_1_DTC_TECHNICIAN_ARCHITECTURE.md)
-- adds new funnel events to the existing analytics_events ledger (migration
-- 0027). Purely additive — widens the event_type check constraint only;
-- no existing row's event_type value is affected.

alter table analytics_events drop constraint analytics_events_event_type_check;
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
    'upgrade_from_consultation_clicked'
  ));
