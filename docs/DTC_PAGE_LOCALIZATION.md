# DTC Page Localization

## What this is

Translates the curated `dtc_codes` reference content (title, meaning, symptoms, causes, diagnostic steps, common mistakes, FAQ) into a visitor's selected language on `/dtc/[code]` and `/[make]/[slug]`. Previously these pages were 100% English regardless of `[locale]`, with a fixed disclosure note explaining that gap — see `docs/AI_LANGUAGE_LOCALIZATION.md`'s "What was deferred" section for why this was scoped out of that earlier pass.

## Two decisions made explicit before building this

1. **Free for everyone, not plan-gated.** Every other AI translation surface in this app (Scan Report Analysis, Guided Diagnosis) is Pro/Workshop-only, because translating a paid diagnostic output is itself a paid feature. DTC pages are different: they're public curated SEO/reference content, already served to anonymous visitors and crawlers (redacted in *depth*, not *language*, for free users). Gating translation on top of that would mean a non-English visitor gets English text on a page otherwise fully open to them. The only gate here is `languages.ai_output_enabled` — is this locale eligible for AI translation at all — never a plan check.
2. **`drive_recommendation` stays English.** Same rule already applied to `scan_reports.safety_warnings` and Diagnostic Engine turns' `DriveSafetyClassification.reasoning`: safety-critical guidance isn't machine-translated until a reviewed per-locale safety pack exists. It's excluded from `DtcCodeTranslatable` entirely, never sent to the translation provider.

## Architecture

Same three-file pattern as scan-report and Diagnostic Engine turn translation:

- `src/lib/dtc-translation.ts` — pure. `DtcCodeTranslatable` (title, metaDescription, meaning, symptoms[], causes[], diagnosticSteps[], commonMistakes, faq[]); `extractTranslatableStrings`/`applyTranslatedStrings` skip absent optional fields (metaDescription/commonMistakes can be null) rather than translating a placeholder; `translateDtcCode()` orchestrates through the **same, unmodified** `AnthropicTranslationProvider` every other translation surface uses.
- `src/lib/localized-dtc-code.ts` — pure orchestration (`resolveLocalizedDtcCode`): registry-eligibility gate → cache → translate → persist. No `reserveUsage`/`releaseUsage` — there's no quota to reserve since this is free.
- `src/lib/dtc-code-localization.ts` — production wiring (`getOrCreateLocalizedDtcCode`, `applyLocalizedDtcCode`). Cost observability via `console.log` only, not `recordAiDiagnosticRun` — its `feature` column has a hard DB check-constraint (`'chat'`/`'scan_report'` only, migration 0016) that a free, unbilled surface has no natural home in anyway, matching the same deliberate gap the Diagnostic Engine turn-translation feature left.

## Caching

`dtc_code_localizations` (migration 0049) — keyed by `(dtc_code_id, locale_code)`, unlike the content-addressed hash used for Diagnostic Engine turns: a `dtc_codes` row is admin-edited and stable, not a live evolving case, so a real row id is the correct cache key. Public-read RLS scoped to published codes (mirrors `dtc_codes`' own RLS), no owner concept — one translation serves every visitor.

Translation runs **before** redaction (`filterDtcCodeForAccessLevel`), on the full canonical row, so the cache is shared across all access levels — a free-tier visitor's page load can produce the same cached translation a Pro visitor later reads for the locked fields, with zero risk of exposing locked content, since redaction still runs identically afterward on the (possibly localized) row.

## Safety-warning detection stays on the English canonical, always

`detectSafetyWarnings()` is a plain English-keyword regex scanner (`/overheat/i`, `/brake failure/i`, etc.) run against `meaning + symptoms + causes + drive_recommendation`. Running it against *translated* text would silently miss real danger conditions in every non-English locale. Both page components now compute `safetyWarnings` from the canonical row **before** localization is applied, and pass it into `DtcCodeResult` as a prop — the component no longer computes it internally from whatever `dtc` object it's handed.

## The "not localized" disclosure note

`dtcResult.contentNotLocalizedNote` (all 12 catalogs) used to show unconditionally whenever `locale !== "en"`. It's now driven by a `showUntranslatedNote` prop, true only when the locale isn't `ai_output_enabled` or the translation attempt fell back to English — not a blanket non-English check, since real translated content now exists for eligible locales.

## What was NOT changed

Diagnostic reasoning, `dtc_codes`' structured fields (code, make, model, engine_code, difficulty, severity, related_makes, urls, source provenance, review status), the `fts` full-text search column (built from the canonical English row, untouched), and the existing plan-based redaction (`filterDtcCodeForAccessLevel`) are all unchanged. Only the prose fields feeding the rendered page are swapped for a translated version when one exists.
