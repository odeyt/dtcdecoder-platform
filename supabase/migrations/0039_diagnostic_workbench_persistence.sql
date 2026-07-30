-- Diagnostic Workbench redesign: persistence for ongoing technician notes,
-- per-test checkbox/outcome state, per-cause review status, the fixed
-- verification checklist, and technician-initiated case completion (distinct
-- from scan_cases.status, which only tracks the AI pipeline stage).
--
-- None of this existed before this migration — confirmed by audit: the only
-- prior persistence was scan_cases.technician_notes (write-once at case
-- creation, no edit path) and scan_feedback (one-time post-repair form).
--
-- Ownership/RLS follows this codebase's existing convention exactly
-- (0012/0013): owner-select-only policies, no insert/update/delete policy on
-- any of these tables — every write goes through the admin client after an
-- explicit ownership check in the API route.
--
-- ranked_causes/recommended_tests on scan_reports are plain jsonb arrays
-- with no stable per-item id, so progress/status here is keyed by array
-- position (case_id, test_index) / (case_id, cause_index). This is safe
-- because a scan_reports row is never regenerated in place once created.

create table scan_case_notes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references scan_cases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null check (category in ('observation', 'measurement', 'repair_performed', 'follow_up')),
  body text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index scan_case_notes_case_id_idx on scan_case_notes (case_id, created_at desc);

create trigger scan_case_notes_set_updated_at
before update on scan_case_notes
for each row execute function set_updated_at();

alter table scan_case_notes enable row level security;
create policy scan_case_notes_owner_read on scan_case_notes
  for select using (exists (select 1 from scan_cases c where c.id = case_id and c.user_id = auth.uid()));

create table scan_report_test_progress (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references scan_cases (id) on delete cascade,
  report_id uuid not null references scan_reports (id) on delete cascade,
  test_index int not null check (test_index >= 0),
  completed boolean not null default false,
  outcome text not null default 'not_tested' check (outcome in ('pass', 'fail', 'not_tested')),
  actual_result text,
  technician_note text,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (case_id, test_index)
);

create index scan_report_test_progress_case_id_idx on scan_report_test_progress (case_id);

create trigger scan_report_test_progress_set_updated_at
before update on scan_report_test_progress
for each row execute function set_updated_at();

alter table scan_report_test_progress enable row level security;
create policy scan_report_test_progress_owner_read on scan_report_test_progress
  for select using (exists (select 1 from scan_cases c where c.id = case_id and c.user_id = auth.uid()));

create table scan_report_cause_status (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references scan_cases (id) on delete cascade,
  report_id uuid not null references scan_reports (id) on delete cascade,
  cause_index int not null check (cause_index >= 0),
  status text not null default 'untested' check (status in ('untested', 'supported', 'ruled_out', 'confirmed')),
  reviewed boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (case_id, cause_index)
);

create index scan_report_cause_status_case_id_idx on scan_report_cause_status (case_id);

create trigger scan_report_cause_status_set_updated_at
before update on scan_report_cause_status
for each row execute function set_updated_at();

alter table scan_report_cause_status enable row level security;
create policy scan_report_cause_status_owner_read on scan_report_cause_status
  for select using (exists (select 1 from scan_cases c where c.id = case_id and c.user_id = auth.uid()));

-- One row per case — the fixed 8-item verification checklist from the brief.
create table scan_case_verification (
  case_id uuid primary key references scan_cases (id) on delete cascade,
  concern_resolved boolean not null default false,
  dtcs_cleared boolean not null default false,
  dtcs_did_not_return boolean not null default false,
  calibration_completed boolean not null default false,
  road_test_completed boolean not null default false,
  no_new_warning_lights boolean not null default false,
  post_repair_scan_reviewed boolean not null default false,
  customer_notes_recorded boolean not null default false,
  updated_at timestamptz not null default now()
);

create trigger scan_case_verification_set_updated_at
before update on scan_case_verification
for each row execute function set_updated_at();

alter table scan_case_verification enable row level security;
create policy scan_case_verification_owner_read on scan_case_verification
  for select using (exists (select 1 from scan_cases c where c.id = case_id and c.user_id = auth.uid()));

-- Technician-initiated completion, distinct from scan_cases.status (which
-- only reflects the AI pipeline stage — "completed" there means a report was
-- generated, not that a technician has verified and closed the case).
alter table scan_cases
  add column technician_completed_at timestamptz,
  add column technician_completed_by uuid references auth.users (id) on delete set null;

-- Widens the analytics event-type check constraint: adds the 13 new
-- Diagnostic Workbench events, and fixes a pre-existing bug found during
-- this audit — 'continue_previous_diagnosis_clicked' is in the app's TS
-- event-type union and is actually called (ServiceBayHero.tsx) but was
-- missing from this constraint, so every real call has been silently
-- failing (the insert error is caught and only console.error'd).
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
    'diagnostic_report_completed'
  ));
