-- Phase 2.2 — high-voltage/EV safety hazard evidence type
-- (docs/PHASE_2_2_EV_SAFETY_AUDIT.md). Widens diagnostic_evidence's
-- evidence_type check constraint to add 'hv_safety_hazard' — a single
-- evidence type covering every high-voltage hazard category the Safety
-- Engine's deterministic immediate_stop rule checks for (isolation fault,
-- battery thermal event, contactor fault, interlock fault, cable/enclosure
-- damage, water intrusion, charging overheating, etc. — see safety.ts).
-- One type rather than one-per-category because every category in that
-- list maps to the same immediate_stop outcome; the specific category is
-- preserved in the row's own `value` jsonb, not as a separate type. Purely
-- additive — no existing row, column, or other constraint is touched.
--
-- Idempotent (Phase 2 direct-production release, docs/PHASE_2_PRODUCTION_MIGRATION_RUNBOOK.md):
-- "drop if exists" then unconditional "add" — same safe-rerun pattern as
-- migration 0030. Depends on migration 0031 having created
-- diagnostic_evidence first; run in numerical order.
alter table diagnostic_evidence drop constraint if exists diagnostic_evidence_evidence_type_check;
alter table diagnostic_evidence add constraint diagnostic_evidence_evidence_type_check
  check (evidence_type in (
    'vin', 'vehicle', 'engine', 'transmission', 'mileage',
    'complaint', 'symptom', 'dtc_stored', 'dtc_pending', 'dtc_permanent',
    'freeze_frame', 'live_data', 'previous_repair', 'known_repair',
    'technician_note', 'safety_issue', 'environmental_condition',
    'question_answer', 'hv_safety_hazard', 'other'
  ));
