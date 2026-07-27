-- Full-scan-extraction upgrade (see docs/FULL_SCAN_DATA_LOSS_AUDIT.md for the
-- root-cause investigation this responds to). Purely additive: widens one
-- CHECK constraint's allowed value set (existing rows are unaffected — none
-- of them use the new values yet) and adds nullable/defaulted columns plus
-- two new tables. No existing column is dropped, renamed, or narrowed.

-- scan_dtc_records.status previously had no way to store "the source
-- explicitly marked this as a generic/reference-only code" or "the source
-- had a status string we didn't recognize" — both were silently coerced to
-- NULL. Widening lets normalizeStoredDtcStatus (extraction.ts) store the
-- real distinction instead of discarding it.
alter table scan_dtc_records drop constraint scan_dtc_records_status_check;
alter table scan_dtc_records add constraint scan_dtc_records_status_check
  check (status is null or status in (
    'current', 'history', 'pending', 'permanent', 'intermittent', 'stored',
    'reference_only', 'unknown'
  ));

-- Per-DTC provenance and category relevance, computed once at extraction
-- time (see category-classification.ts) so both the report UI and the admin
-- inspection screen can display "why is this counted as a network fault"
-- without re-deriving it from description text on every read.
alter table scan_dtc_records
  add column if not exists system_name text,
  add column if not exists source_page integer,
  add column if not exists source_text text,
  add column if not exists safety_relevance boolean not null default false,
  add column if not exists network_relevance boolean not null default false,
  add column if not exists battery_relevance boolean not null default false,
  add column if not exists bus_off_relevance boolean not null default false;

-- Widen the existing dedup key to include system_name: a multi-system scan
-- report (this migration's whole reason for existing) can legitimately
-- report the SAME code, same status, no distinct module, from two
-- different systems (e.g. U012100 under both "Electric Power Steering" and
-- "A/C System") — without system_name in the key, the original
-- (case_id, module, code, status) index would silently treat the second
-- one as a duplicate of the first and discard a real, distinct finding.
drop index if exists scan_dtc_records_dedup_idx;
create unique index scan_dtc_records_dedup_idx on scan_dtc_records
  (case_id, coalesce(module, ''), coalesce(system_name, ''), code, coalesce(status, ''));

-- Scanner/report metadata + extraction-quality tracking. Added to
-- scan_extractions (one row per case already) rather than a new
-- scan_extraction_quality table — this data describes the SAME extraction
-- pass scan_extractions already represents, and a second one-row-per-case
-- table would just be scan_extractions split in two for no benefit.
alter table scan_extractions
  add column if not exists scanner_brand text,
  add column if not exists diagnostic_application_version text,
  add column if not exists vehicle_software_version text,
  add column if not exists diagnostic_path text,
  add column if not exists test_time text,
  add column if not exists report_type text,
  add column if not exists pages_expected integer,
  add column if not exists pages_parsed integer,
  add column if not exists systems_expected integer,
  add column if not exists systems_parsed integer,
  add column if not exists dtcs_expected integer,
  add column if not exists dtcs_parsed integer,
  add column if not exists extraction_truncated boolean not null default false,
  add column if not exists extraction_confidence text
    check (extraction_confidence is null or extraction_confidence in ('high', 'medium', 'low'));

-- One row per detected system/section (e.g. "1.8T Engine System", "Gateway
-- System (GW)") — tracks the source report's OWN declared DTC count
-- ("DTC (14)") against how many this parser actually extracted, so a
-- silent under-extraction is detectable rather than presented as a
-- complete result. Also captures "systems reported OK" (status = 'ok',
-- dtc_count_reported = 0) which previously had nowhere to be stored.
create table scan_systems (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references scan_cases (id) on delete cascade,
  system_name text not null,
  module_name text,
  status text not null default 'unknown'
    check (status in ('faulted', 'ok', 'unknown')),
  dtc_count_reported integer,
  dtc_count_extracted integer not null default 0,
  extraction_complete boolean not null default true,
  created_at timestamptz not null default now()
);

create index scan_systems_case_id_idx on scan_systems (case_id);

-- One row per deterministic pattern the pre-AI pattern engine detects
-- (src/lib/scan-diagnostics/patterns.ts) — e.g. "vehicle-wide network
-- communication event", "multi-module low-voltage event". Kept separate
-- from scan_reports (the AI's output) per the rule that canonical
-- structured facts and AI interpretation must stay distinguishable: a
-- pattern here is a deterministic finding, never something the AI asserted.
create table scan_patterns (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references scan_cases (id) on delete cascade,
  pattern_type text not null,
  severity text not null check (severity in ('info', 'warn', 'critical')),
  evidence jsonb not null default '{}',
  affected_modules text[] not null default '{}',
  rule_version text not null,
  created_at timestamptz not null default now()
);

create index scan_patterns_case_id_idx on scan_patterns (case_id);

alter table scan_systems enable row level security;
alter table scan_patterns enable row level security;

create policy scan_systems_owner_read on scan_systems
  for select using (
    exists (select 1 from scan_cases c where c.id = case_id and c.user_id = auth.uid())
  );

create policy scan_patterns_owner_read on scan_patterns
  for select using (
    exists (select 1 from scan_cases c where c.id = case_id and c.user_id = auth.uid())
  );
