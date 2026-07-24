-- Diagnostic Safety v2 — additive-only schema changes supporting categorical
-- confidence levels instead of AI-invented numerical probabilities, and a
-- schema-version marker so legacy rows (numeric-only, written before this
-- migration) remain distinguishable and renderable without being deleted
-- or silently reinterpreted.
--
-- No columns are dropped. No existing data is deleted. Numeric confidence
-- columns (scan_reports.confidence, scan_ai_runs.confidence) are kept as
-- deprecated/debug fields — the categorical confidence_level column is the
-- new source of truth for anything user-facing.

alter table scan_reports
  add column schema_version text,
  add column confidence_level text
    check (confidence_level is null or confidence_level in ('high', 'medium', 'low', 'insufficient_evidence'));

-- Backfill: any row that already exists at migration time was necessarily
-- written before this column existed, i.e. by the v1 (numeric-only) code
-- path — tag it explicitly rather than leaving it ambiguous.
update scan_reports set schema_version = '1.0' where schema_version is null;

alter table scan_reports
  alter column schema_version set default '2.0',
  alter column schema_version set not null;

alter table scan_ai_runs
  add column prompt_version text;

comment on column scan_reports.confidence is
  'Deprecated numeric field (v1). Do not render directly to users — see confidence_level. Retained for debugging/audit only.';
comment on column scan_reports.confidence_level is
  'Categorical confidence: high | medium | low | insufficient_evidence. Null on legacy (schema_version = 1.0) rows — render as "Not established", never as a computed/guessed band.';
comment on column scan_reports.schema_version is
  '1.0 = legacy numeric-only report (probabilityPercent/confidence rendered as raw percentages). 2.0 = categorical confidence, no invented probabilities. See docs/DIAGNOSTIC_SCHEMA_V2.md.';
