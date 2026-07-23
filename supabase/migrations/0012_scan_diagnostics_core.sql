-- Diagnostic Scan Report Analysis — core case/file/extraction/DTC schema.
-- Deliberately named scan_* (not diagnostic_*) to avoid colliding with the
-- pre-existing diagnostic_reports / diagnostic_report_localizations tables
-- (0007), which store saved AI-chat answers and are unrelated to scan-file
-- uploads. No organizations/shops exist in this schema — every row is
-- scoped directly to a single owning user_id, matching every other table.

create table scan_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'draft'
    check (status in (
      'draft', 'uploaded', 'extracting', 'extraction_review',
      'ready_for_analysis', 'analyzing', 'completed', 'failed'
    )),
  status_updated_at timestamptz not null default now(),
  error_message text,
  complaint text,
  symptoms text[] not null default '{}',
  mileage integer,
  recent_repairs text,
  battery_condition text,
  technician_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index scan_cases_user_id_idx on scan_cases (user_id, created_at desc);

create trigger scan_cases_set_updated_at
before update on scan_cases
for each row execute function set_updated_at();

create table scan_case_files (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references scan_cases (id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  declared_mime_type text not null,
  detected_format text
    check (detected_format is null or detected_format in (
      'pdf', 'txt', 'csv', 'json', 'xml', 'html', 'unknown'
    )),
  file_size_bytes bigint not null,
  file_sha256 text not null,
  uploaded_at timestamptz not null default now()
);

create index scan_case_files_case_id_idx on scan_case_files (case_id);

-- One row per case: re-running extraction upserts in place rather than
-- accumulating history, so the extraction stage is naturally idempotent
-- and retryable (see src/lib/scan-diagnostics/extraction.ts).
create table scan_extractions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references scan_cases (id) on delete cascade,
  file_id uuid not null references scan_case_files (id) on delete cascade,
  parser_id text not null,
  parser_version text not null,
  vin text,
  make text,
  model text,
  model_year integer,
  engine text,
  odometer_miles integer,
  modules jsonb not null default '[]',
  freeze_frame jsonb not null default '[]',
  live_data jsonb not null default '[]',
  image_only_pdf boolean not null default false,
  warnings text[] not null default '{}',
  -- User corrections layered on top of parser output, keyed by field name —
  -- never overwrites the original extracted values, so the review UI can
  -- always show "extracted" vs "user-entered" provenance side by side.
  reviewed_fields jsonb not null default '{}',
  extracted_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create unique index scan_extractions_case_id_idx on scan_extractions (case_id);

create table scan_dtc_records (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references scan_cases (id) on delete cascade,
  module text,
  code text not null,
  status text
    check (status is null or status in (
      'current', 'history', 'pending', 'permanent', 'intermittent', 'stored'
    )),
  description_raw text,
  source text not null default 'extracted'
    check (source in ('extracted', 'user_added', 'user_edited')),
  created_at timestamptz not null default now()
);

-- Dedup key per the spec: module + code + status. NULLs are coalesced
-- because Postgres treats NULL <> NULL in a unique index (two module-less
-- rows for the same code/status would otherwise both insert unchecked).
create unique index scan_dtc_records_dedup_idx on scan_dtc_records
  (case_id, coalesce(module, ''), code, coalesce(status, ''));

create index scan_dtc_records_case_id_idx on scan_dtc_records (case_id);
create index scan_dtc_records_code_idx on scan_dtc_records (code);

alter table scan_cases enable row level security;
alter table scan_case_files enable row level security;
alter table scan_extractions enable row level security;
alter table scan_dtc_records enable row level security;

-- Read-only for owners; every write goes through createAdminClient() after
-- an explicit ownership check in the API route — matching the
-- diagnostic_reports (0007) precedent exactly. No insert/update/delete
-- policy is granted here on purpose.
create policy scan_cases_owner_read on scan_cases
  for select using (auth.uid() = user_id);

create policy scan_case_files_owner_read on scan_case_files
  for select using (
    exists (select 1 from scan_cases c where c.id = case_id and c.user_id = auth.uid())
  );

create policy scan_extractions_owner_read on scan_extractions
  for select using (
    exists (select 1 from scan_cases c where c.id = case_id and c.user_id = auth.uid())
  );

create policy scan_dtc_records_owner_read on scan_dtc_records
  for select using (
    exists (select 1 from scan_cases c where c.id = case_id and c.user_id = auth.uid())
  );
