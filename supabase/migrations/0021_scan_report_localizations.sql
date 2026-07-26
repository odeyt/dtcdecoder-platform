-- Per-locale localizations of the canonical English scan_reports row. The
-- canonical scan_reports record is never modified; each localized version is a
-- separate row (spec: no conflicting diagnostic records). Only translatable
-- prose is stored translated — structure, ordering, confidenceLevel, numeric
-- confidence, and safety_warnings come from the canonical report. Safety
-- warnings are NOT localized here (they stay English until a reviewed per-locale
-- safety pack exists — see CONTENT_LOCALIZATION_ARCHITECTURE.md).
--
-- Prerequisite verified in production: scan_cases, scan_ai_runs, scan_reports
-- all exist (unlike the orphaned 0007 model).

create table if not exists scan_report_localizations (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references scan_reports (id) on delete cascade,
  locale_code text not null references languages (locale_code),
  -- Translated ranked_causes[] + recommended_tests[] + missing_information[],
  -- same structure/order as the canonical, prose fields translated.
  localized_payload jsonb not null,
  -- Translation audit metadata (from the TranslationProvider result):
  source_locale text not null default 'en',
  requested_locale text not null,
  resolved_locale text not null,
  provider text,
  model text,
  glossary_version int,
  prompt_version text,
  status text not null default 'completed'
    check (status in ('completed', 'fallback', 'failed')),
  fallback_used boolean not null default false,
  translated_at timestamptz,
  latency_ms int,
  created_at timestamptz not null default now(),
  unique (report_id, locale_code)
);

create index if not exists scan_report_localizations_report_idx
  on scan_report_localizations (report_id);

alter table scan_report_localizations enable row level security;

-- Owner-read only, via the owning scan_cases row — mirrors scan_reports_owner_read.
drop policy if exists scan_report_localizations_owner_read on scan_report_localizations;
create policy scan_report_localizations_owner_read on scan_report_localizations
  for select using (
    exists (
      select 1
      from scan_reports r
      join scan_cases c on c.id = r.case_id
      where r.id = report_id and c.user_id = auth.uid()
    )
  );
