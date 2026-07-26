-- Adds translation-audit metadata to diagnostic_report_localizations so each
-- stored localized report records how it was produced and whether it fell back
-- to English. Additive only: new nullable/defaulted columns on an existing
-- table — no data change, no constraint change (translation_status keeps its
-- existing check; fallback is captured by the new boolean, not a new status
-- value, to avoid altering the CHECK).
--
-- These back the TranslationProvider pipeline: on a failed provider call or a
-- failed protected-token check, the stored row must have fallback_used=true and
-- serve the English canonical, and quota must not be consumed (enforced in app
-- code, see docs/DYNAMIC_REPORT_TRANSLATION.md).

alter table diagnostic_report_localizations
  add column if not exists source_locale text not null default 'en',
  add column if not exists requested_locale text,
  add column if not exists resolved_locale text,
  add column if not exists provider text,
  add column if not exists model text,
  add column if not exists glossary_version int,
  add column if not exists prompt_version text,
  add column if not exists fallback_used boolean not null default false,
  add column if not exists translated_at timestamptz,
  add column if not exists latency_ms int;
