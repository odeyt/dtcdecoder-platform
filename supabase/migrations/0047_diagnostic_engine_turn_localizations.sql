-- Per-locale localizations of a Diagnostic Engine turn's hypotheses + test
-- plan prose. Unlike scan_report_localizations, a turn has no single
-- persisted "report id" to key off — case memory (diagnostic_graph) is a
-- live, evolving row, not a one-time-generated document — so this is keyed
-- by a content-addressed hash of the canonical (English) hypotheses/test-plan
-- payload instead (see computeTurnCacheKey in turn-localization.ts). Same
-- content -> same key -> cache hit; content that actually changed (new
-- evidence, re-ranked hypotheses) -> a different key -> a fresh translation,
-- never a stale one silently served.
--
-- Only translatable prose is stored translated — rank, confidenceLevel,
-- evidenceStrength, supportingEvidenceIds, difficulty, risk, costLevel, and
-- relatedHypothesisRanks all come from the canonical (untouched) turn.
-- DriveSafetyClassification.reasoning is deliberately never part of this
-- table's payload at all — same "stays English until a reviewed per-locale
-- safety pack exists" rule already applied to scan_reports' safety_warnings.

create table if not exists diagnostic_engine_turn_localizations (
  id uuid primary key default gen_random_uuid(),
  turn_cache_key text not null,
  case_id uuid not null references scan_cases (id) on delete cascade,
  locale_code text not null references languages (locale_code),
  -- Translated hypotheses[] + testPlan[], same structure/order as the
  -- canonical DiagnosticTurnTranslatable, prose fields translated.
  localized_payload jsonb not null,
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
  unique (turn_cache_key, locale_code)
);

create index if not exists diagnostic_engine_turn_localizations_case_idx
  on diagnostic_engine_turn_localizations (case_id);

alter table diagnostic_engine_turn_localizations enable row level security;

-- Owner-read only, via the owning scan_cases row — mirrors
-- scan_report_localizations_owner_read.
drop policy if exists diagnostic_engine_turn_localizations_owner_read on diagnostic_engine_turn_localizations;
create policy diagnostic_engine_turn_localizations_owner_read on diagnostic_engine_turn_localizations
  for select using (
    exists (
      select 1
      from scan_cases c
      where c.id = case_id and c.user_id = auth.uid()
    )
  );
