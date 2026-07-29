-- Expands the DTC reference layer so standard generic OBD-II codes stop
-- falling through to "This code isn't in our reference database yet."
-- (src/lib/landing-intake/engine.ts) purely for lack of seed data — the
-- lookup code path itself already works (searchDtcCodes, src/lib/dtc.ts).
--
-- Deliberately extends dtc_codes rather than adding a parallel
-- "manufacturer definitions" table: dtc_codes already models generic vs.
-- manufacturer-specific as one table via nullable make/model/engine_code
-- plus the two partial unique indexes from 0003_dtc_platform.sql (a
-- generic row and a make-specific row can share the same slug). A second
-- table for the same concept would be exactly the duplicate-architecture
-- this project's conventions warn against.
--
-- This repo has no shop/organization/workspace concept anywhere (checked
-- before writing this) — dtc_verified_repairs is scoped by the recording
-- user (auth.users) instead of a shop_id that doesn't exist yet.

alter table dtc_codes
  add column normalized_code text,
  add column family text,
  add column code_type text check (code_type in ('generic', 'manufacturer_specific', 'reserved', 'unknown')),
  add column generic_definition boolean not null default false,
  add column manufacturer_specific boolean not null default false,
  add column reserved_code boolean not null default false,
  add column source_type text not null default 'original',
  add column source_name text,
  add column source_url text,
  add column source_license text,
  add column source_version text,
  add column source_hash text,
  add column review_status text not null default 'unreviewed'
    check (review_status in ('unreviewed', 'in_review', 'approved', 'rejected')),
  add column reviewed_by uuid references auth.users (id) on delete set null,
  add column reviewed_at timestamptz,
  add column active boolean not null default true;

-- Backfill for every pre-existing row (the 5 starter codes) — computed
-- deterministically from data already on the row, not guessed.
update dtc_codes
set
  normalized_code = upper(trim(code)),
  family = upper(left(trim(code), 1)),
  code_type = case when make is null then 'generic' else 'manufacturer_specific' end,
  generic_definition = (make is null),
  manufacturer_specific = (make is not null),
  source_type = 'original',
  review_status = 'approved'
where normalized_code is null;

alter table dtc_codes
  alter column normalized_code set not null,
  alter column family set not null;

create index dtc_codes_normalized_code_idx on dtc_codes (normalized_code);
create index dtc_codes_active_idx on dtc_codes (active) where active = true;
create index dtc_codes_review_status_idx on dtc_codes (review_status);

-- Verified repair intelligence (D1 Imports' own confirmed cases). Never a
-- source for the base reference definition above — this is downstream,
-- optional corroboration, kept separate from dtc_codes so a technician's
-- one-off repair notes can never silently become the published definition.
create table dtc_verified_repairs (
  id uuid primary key default gen_random_uuid(),
  dtc_code_id uuid references dtc_codes (id) on delete set null,
  recorded_by_user_id uuid references auth.users (id) on delete set null,
  vehicle_year int,
  manufacturer text,
  model text,
  engine text,
  vin_hash text,
  symptoms jsonb not null default '[]',
  related_codes jsonb not null default '[]',
  test_results jsonb not null default '[]',
  confirmed_root_cause text not null,
  completed_repair text not null,
  parts_used jsonb not null default '[]',
  labor_minutes int check (labor_minutes is null or labor_minutes >= 0),
  verification_method text,
  outcome text not null,
  technician_notes text,
  evidence_quality text not null default 'unverified'
    check (evidence_quality in ('unverified', 'self_reported', 'verified')),
  approved_for_aggregation boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index dtc_verified_repairs_dtc_code_id_idx on dtc_verified_repairs (dtc_code_id);
create index dtc_verified_repairs_recorded_by_idx on dtc_verified_repairs (recorded_by_user_id);

create trigger dtc_verified_repairs_set_updated_at
before update on dtc_verified_repairs
for each row execute function set_updated_at();

-- Owner-read only — never publicly readable. Public/customer-facing
-- surfaces must only ever read pre-aggregated, anonymized output (no such
-- surface exists yet; this table has no public policy at all today).
alter table dtc_verified_repairs enable row level security;
create policy dtc_verified_repairs_owner_read on dtc_verified_repairs
  for select using (auth.uid() = recorded_by_user_id);

-- Dataset import provenance/audit trail. Service-role only — no public or
-- owner-read policy, matching terminology_glossary's precedent for
-- internal-only operational tables.
create table dtc_dataset_imports (
  id uuid primary key default gen_random_uuid(),
  dataset_name text not null,
  dataset_version text,
  source_url text,
  license_name text,
  license_url text,
  imported_record_count int not null default 0,
  inserted_record_count int not null default 0,
  updated_record_count int not null default 0,
  rejected_record_count int not null default 0,
  checksum text,
  status text not null check (status in ('running', 'completed', 'failed', 'rejected')),
  import_log jsonb not null default '{}',
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index dtc_dataset_imports_status_idx on dtc_dataset_imports (status);

alter table dtc_dataset_imports enable row level security;
-- No policy at all — service-role only (the import script itself).
