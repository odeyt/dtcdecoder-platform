# Content Localization Architecture

The master architecture for how DTCDecoder localizes content, and the settled
decision on which record is the canonical DTC report.

## Two layers (never mixed)

| Layer | Content | Method |
|---|---|---|
| **Static UI** | landing, nav, buttons, pricing, account/preferences, SEO metadata, error/empty states, footer, legal labels | version-controlled next-intl language packs (`messages/<locale>.json`), English canonical, English fallback, no runtime AI |
| **Dynamic report** | the structured DTC diagnostic report | server-side AI translation of the canonical English record, glossary-protected, token-validated |
| **Symptoms in** | user-entered symptom text | language detection + normalization to canonical English (pipeline, not yet built) |
| **Safety** | safety-critical warnings | reviewed per-locale pack with English fallback (not yet built; English until reviewed) |
| **Terms** | automotive terminology | controlled `terminology_glossary` (live) applied before general translation |

Static UI is Layer 1 and is COMPLETE (12 locales, parity-tested). This document
focuses on the dynamic report layer.

## DECISION (settled 2026-07-26): scan-diagnostics `scan_reports` is the canonical DTC report

There are three candidate "report" surfaces in the repo; only one is the
canonical DTC report:

| Candidate | Verdict |
|---|---|
| **scan-diagnostics `scan_reports`** (0013) | **CANONICAL OWNER.** Structured record — `ranked_causes`, `recommended_tests`, `safety_warnings`, `confidence`, `confidence_rationale`, `missing_information` — matching the spec's report exactly (ranked root causes, diagnostic order, safety classification, stop conditions). Referenced by live code (`report.ts`, `cases.ts`, `feedback.ts`, `schemas.ts`); persisted by `assembleAndPersistReport` (upsert per case); rendered by `ScanReportView`. |
| AI assistant chat (`search_history`) | NOT the report. Ad-hoc Q&A; streams free text; no structured causes/tests/safety. It already translates on the fly for display but is not a stored canonical report. |
| `diagnostic_reports` / `diagnostic_report_localizations` (0007) | **ORPHANED — do not use.** Never applied to production; no `src/` code references it. The premature `0020_report_translation_metadata` migration targeted this and was reverted. |

**Rationale:** the canonical DTC report must be a single structured record with
ranked causes, an ordered test sequence, safety classification, and
deterministic values (confidence). Only `scan_reports` is that record and is
actually wired. English is the canonical language of `scan_reports`; localized
versions are translations of it and never a re-diagnosis.

## Localization design (to build against `scan_reports`)

### New table: `scan_report_localizations`

```
scan_report_localizations
  id                uuid pk
  report_id         uuid not null → scan_reports(id) on delete cascade
  locale_code       text not null → languages(locale_code)
  -- translated natural-language fields (structure/order preserved from canonical):
  localized_payload jsonb not null        -- { rankedCauses[], recommendedTests[] } with descriptions translated
  -- translation audit metadata (from the TranslationProvider):
  source_locale     text not null default 'en'
  requested_locale  text not null
  resolved_locale   text not null          -- = requested on success, 'en' on fallback
  provider          text
  model             text
  glossary_version  int
  prompt_version    text
  status            text   check in ('completed','fallback','failed')
  fallback_used     boolean not null default false
  translated_at     timestamptz
  latency_ms        int
  unique (report_id, locale_code)
```

RLS: owner-read only, via the owning `scan_cases` row (mirror the existing
`scan_reports` policy). Canonical `scan_reports` is **never modified**.

### What is translated vs preserved

- **Translate:** the natural-language prose inside `ranked_causes[].description`
  and `recommended_tests[].description` / step text.
- **Preserve unchanged (via glossary + `verifyTokenPreservation`):** DTC codes,
  VINs, module acronyms, measurements, connector/pin IDs, part numbers, the
  ranked ORDER, and `confidence` / `confidence_rationale` numeric values.
- **Safety warnings:** stay **English** until the reviewed per-locale safety
  pack exists (safety rule — no unreviewed runtime AI for safety-critical
  warnings). Localized safety warnings are a separate, review-gated build.

### Pipeline (reusing what's already built)

```
canonical scan_reports row (English)
  → entitlement check: getAllowedOutputLocales(plan) gates the target locale
  → cache lookup: localizedReportCacheKey(reportId, version, locale, glossaryVersion, promptVersion, provider, model)
  → AnthropicTranslationProvider.translateDiagnosticReport(...)   [already built + tested]
      → glossary-protected translation of the translatable fields
      → verifyTokenPreservation(canonical, translated)            [already built + tested]
      → on token-drop or provider error: English fallback (status fallback/failed)
  → persist scan_report_localizations row with metadata
  → on failure: release usage reservation (no quota consumed), serve English canonical
```

`TranslationProvider`, `verifyTokenPreservation`, and `localizedReportCacheKey`
already exist and are unit-tested (`src/lib/ai/translation-provider.ts`,
`token-preservation.ts`). This slice adds: the table, a writer that maps
`scan_reports` fields → provider → persistence, entitlement gating, and a
report-language selector in `ScanReportView` (paid; free = English).

### Fallbacks

- Report: requested localized → cached → provider → **English canonical**.
- Never serve a blank report, raw keys, or an unvalidated translation.
- Failed/fallback translations are not cached as successful and do not consume
  paid quota.

## Build discipline (the 0007 lesson)

**Do not write a migration against a table without confirming it exists in the
live database.** `0007` looked applied in the repo but was not in production.
Before building `scan_report_localizations`, confirm the scan-diagnostics tables
exist in prod:

```sql
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('scan_cases','scan_ai_runs','scan_reports');
-- expect all three rows
```

If any are missing, the scan-diagnostics migrations (0012–0015) must be applied
first (the feature is gated behind NEXT_PUBLIC_SCAN_DIAGNOSTICS_ENABLED).

## Status

- **Settled:** `scan_reports` is the canonical report owner.
- **Reusable, built, tested:** `TranslationProvider`, token-preservation guard,
  cache key, glossary (extended).
- **Pending (next slice, after the verification query above):**
  `scan_report_localizations` migration + writer + entitlement gating + the
  `ScanReportView` language selector. Safety-warning localization is a separate
  review-gated build. No language is human-verified.
- **Not required:** MCP (translation is a direct server-side provider call).
