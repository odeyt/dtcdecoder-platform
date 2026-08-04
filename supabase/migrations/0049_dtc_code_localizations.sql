-- Per-locale localizations of a canonical dtc_codes row. Unlike
-- scan_report_localizations (per-user, owner-read RLS), DTC reference
-- content is shared public content, not user-owned -- one translation per
-- (dtc_code_id, locale) is reused by every visitor, mirroring the
-- languages/currencies public-read pattern rather than an owner check.
-- Scoped to published codes only, matching dtc_codes' own RLS posture (see
-- the comment in src/lib/dtc.ts).
--
-- drive_recommendation is deliberately never part of localized_payload --
-- same "stays English until a reviewed per-locale safety pack exists" rule
-- already applied to scan_reports' safety_warnings and Diagnostic Engine
-- turns' DriveSafetyClassification.reasoning (see
-- docs/CONTENT_LOCALIZATION_ARCHITECTURE.md). detectSafetyWarnings() also
-- always runs against the canonical English text, never this table's
-- content, for the same reason a translated string can't be scanned by an
-- English-keyword regex.

create table if not exists dtc_code_localizations (
  id uuid primary key default gen_random_uuid(),
  dtc_code_id uuid not null references dtc_codes (id) on delete cascade,
  locale_code text not null references languages (locale_code),
  -- Translated title/meta_description/meaning/symptoms[]/causes[]/
  -- diagnostic_steps[]/common_mistakes/faq[], same structure as the
  -- canonical row's own fields, prose translated.
  localized_payload jsonb not null,
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
  unique (dtc_code_id, locale_code)
);

create index if not exists dtc_code_localizations_dtc_code_idx
  on dtc_code_localizations (dtc_code_id);

alter table dtc_code_localizations enable row level security;

-- Public read, scoped to published codes -- no owner concept here, this is
-- shared reference content read by anonymous visitors and crawlers alike.
drop policy if exists dtc_code_localizations_public_read on dtc_code_localizations;
create policy dtc_code_localizations_public_read on dtc_code_localizations
  for select using (
    exists (
      select 1
      from dtc_codes d
      where d.id = dtc_code_id and d.is_published = true
    )
  );
