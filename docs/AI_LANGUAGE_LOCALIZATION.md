# AI Language Localization

## The architecture decision: translate once, never regenerate

This app's diagnosis is generated **once, in English**, and every language is a translation of that one fixed text — never an independent AI generation per language. This was a deliberate decision made before this feature was built (documented in `docs/CONTENT_LOCALIZATION_ARCHITECTURE.md`/`docs/DYNAMIC_REPORT_TRANSLATION.md`), and this feature was explicitly asked to **keep** that decision rather than switch to native per-language generation, after the tradeoff was raised: native generation means N independent AI calls per case (cost), and a real risk that a Thai-generated diagnosis and an English-generated diagnosis for the *same case* genuinely disagree — a data-integrity problem for something people make repair decisions from.

Every localization surface below follows the same shape: generate/derive in English → translate the fixed English prose → cache the translation → serve it. Reasoning, ranking, and any value derived from English text (e.g. Test Planner's difficulty/risk keyword matching) always happens on the English original, before translation ever runs.

## Coverage map

Before writing any new code, the existing codebase was audited for what already had translation wired up. Full detail in the audit that drove this feature's scope; summary:

| Surface | Status before this feature | What this feature did |
|---|---|---|
| Scan Report Analysis | **Already fully built** — prompt, cache table (`scan_report_localizations`), API route, UI switcher | Nothing — reused as-is |
| Professional Diagnostic Report | **Already built** (inherits the Scan Report pipeline; UI strings already localized) | Nothing — reused as-is |
| Guided Diagnosis (Diagnostic Engine turns) | Not built — English only | **Built**: hypotheses + test plan translation (see below) |
| Test Planner | Not built — English only (bundled into Diagnostic Engine turns) | **Built**: covered by the same turn translation, applied *after* the English-keyword-based difficulty/risk/cost derivation |
| Repair Verification | Not built — English only, fixed 6-item template | **Deferred** — see "What was deferred" below |
| Diagnostic Questions | Not built — English only, fixed 11-item bank | **Deferred** — see "What was deferred" below |
| DTC code page | Not built — curated English database rows, no localization mechanism at all | **Deferred** — see "What was deferred" below |
| Terminology glossary | Mechanism built (`terminology_glossary` table, `listGlossaryForLocale`), content sparse (8 Spanish-only rows, proof-of-concept per its own migration comment) | **Deferred** — see "What was deferred" below |

## AI language resolver

`src/lib/i18n/ai-language.ts` / `ai-language-resolver.ts` / `language-utils.ts` — the requested resolver, reusing the Region Profile System and next-intl's existing locale registry rather than inventing a parallel one.

Priority chain (`resolveAiLanguage`, pure function, no I/O):

1. **User Profile** — a signed-in user's own saved AI-output language preference.
2. **Region Profile** — the resolved `RegionProfile.defaultLanguage` (see `docs/REGION_PROFILE_ARCHITECTURE.md`) — bridged via `regionDefaultLanguageFrom()` in `language-utils.ts`.
3. **Selected UI Language** — the current interface language.
4. **Browser Locale** — the visitor's own `Accept-Language`/`navigator.language`.
5. **English** — final fallback.

This resolver answers *which language*, not *is the caller entitled to it* — actual AI-output eligibility (`isAiOutputEnabledLocale`) and plan entitlement (`getAllowedOutputLocales`) are checked separately at each call site, exactly as they already were for scan-report and chat translation. Mixing a live DB entitlement check into a "which language" resolver would make a supposedly pure function depend on I/O.

## Guided Diagnosis (Diagnostic Engine) translation

New files, closely mirroring the already-shipped scan-report translation pattern (`report-translation.ts` → `localized-report.ts` → `report-localization.ts`) rather than generalizing it with a type parameter — a working, tested path is not risked by a refactor done under this feature's time pressure:

- `src/lib/diagnostic-engine/turn-translation.ts` — `DiagnosticTurnTranslatable` (hypotheses + test plan), extract/apply/translate, reusing the **exact same** `AnthropicTranslationProvider` the scan-report path uses (it's already fully generic over its canonical payload).
- `src/lib/diagnostic-engine/localized-turn.ts` — the cache → entitlement → translate → persist orchestration (`resolveLocalizedTurn`).
- `src/lib/diagnostic-engine/turn-localization.ts` — production wiring, including `computeTurnCacheKey()`.
- `supabase/migrations/0047_diagnostic_engine_turn_localizations.sql` — the cache table.
- Wired into `POST /api/diagnostic-engine/v1/cases/[caseId]/turn` as a presentation-only step **after** the full turn result is computed — evidence, the probability/confidence engines, safety classification, and Test Planner's difficulty/risk/cost derivation all already ran in English by the time translation runs, and are never re-derived from translated text.

### What's translated vs. never translated

Translated (prose): `RankedHypothesis.hypothesis`, `.reasoning`, `.missingEvidence[]`, `.requiredTests[]`; `PlannedTest.step`, `.purpose`, `.expectedResult`.

Never translated (preserved exactly): `rank`, `confidenceLevel`, `evidenceStrength`, `supportingEvidenceIds`, `difficulty`, `risk`, `costLevel`, `relatedHypothesisRanks` — none of these are prose, and `difficulty`/`risk`/`costLevel` are derived from the English `step` text via keyword matching (`test-planner.ts`) *before* this ever runs.

**`DriveSafetyClassification.reasoning` is deliberately excluded from the translatable payload entirely** — the same "stays English until a reviewed per-locale safety pack exists" rule already applied to scan reports' `safety_warnings` (`CONTENT_LOCALIZATION_ARCHITECTURE.md`). Safety-critical text is not machine-translated without a review step, in either pipeline.

### Caching

Content-addressed, not row-id-keyed: a Diagnostic Engine turn has no single persisted "report id" the way a scan report does — case memory (`diagnostic_graph`) is a live, evolving row. `computeTurnCacheKey(caseId, canonical)` hashes the canonical English payload; identical content (same evidence state) hits cache, content that actually changed (new evidence, re-ranked hypotheses) gets a fresh translation — never a stale one silently served.

### Cost observability — a deliberate gap, not an oversight

The translation step does **not** call either existing usage ledger:

- Not `ai-diagnostics/usage.ts`'s `recordAiDiagnosticRun` — its underlying tables have a hard `feature in ('chat', 'scan_report')` check constraint (migration `0016`) that a new value would violate without its own migration.
- Not `diagnostic-engine/usage.ts`'s `recordDiagnosticEngineUsage` — that ledger tracks `turnDailyLimit`/`turnMonthlyLimit` consumption (see `entitlements.ts`), and this is a translation of an *already-generated* turn, not a new one. Wiring into it without fully auditing its increment semantics risked double-counting a technician's turn quota — a real concern this codebase already takes seriously (`docs/DIAGNOSTIC_ENGINE_SAFETY_NULL_AUDIT.md`, `budget-guard.ts`).

A `console.log` gives basic per-call observability (case, plan, locale, model, token counts, latency) without touching either safety-audited ledger. Wiring real cost-ledger integration is a real follow-up, once the correct increment semantics are confirmed with whoever owns the Diagnostic Engine's budget guard — not something to guess at under this feature's own time pressure.

## What was deferred (disclosed, not silently dropped)

- **Repair Verification checklist** (`REPAIR_VERIFICATION_TEMPLATE`, 6 fixed strings) and **Diagnostic Questions** (`QUESTION_BANK`, 11 fixed strings) are **not AI-generated** — they're static, deterministic template content, same category as any other static UI string in this app. The right way to localize them is next-intl message-catalog entries, not an AI translation call. That's straightforward *mechanically*, but this codebase's `catalog-parity` test enforces zero key drift across all 12 live-locale catalogs (no partial exemption) — so doing it properly means adding ~17 new keys to all 12 files, a real content task deferred to keep this pass honest rather than rushed. The `item` field is also used as a lookup key by the repair-verification `PATCH` endpoint (`updateRepairVerificationItem(caseId, item, ...)`), so any translation there must be additive (a new display field), never a replacement of the identifier — noted for whoever picks this up.
- **DTC code page** — confirmed 100% curated English static content (`dtc_codes` table), with no per-locale companion table or mechanism of any kind. This is also the page whose own copy currently reads "Sourced from our reviewed reference database — not generated by DTC Technician" — routing it through AI translation is a real product decision (does that disclosure need to change for a translated view?), not purely an engineering one, deferred for that reason.
- **Terminology glossary population** — the mechanism (`terminology_glossary` table, `listGlossaryForLocale`, prompt injection) is already fully built and already used by both the scan-report and the new Diagnostic Engine translation paths. Content is sparse: 8 Spanish-only rows, explicitly described by its own migration as "proving the protection mechanism... not a claim that Spanish's glossary is complete." Populating real, professionally-reviewed Thai/Lao automotive terminology at scale is a content-quality task, not something to bulk-generate under this feature's time pressure without native-speaker review — see `docs/MULTI_LANGUAGE_OUTPUT.md`.
- **PDF/email reports** — no PDF or email report *export* feature exists anywhere in this app (confirmed by the earlier Region Profile System audit too). Nothing to localize.
- **Exhaustive Playwright coverage** across every surface/every language — deferred in favor of focused unit coverage of the new translation logic itself (resolver priority chain, extract/apply round-trip, cache/entitlement/fallback orchestration, content-addressed cache-key stability). The Diagnostic Engine sits behind its own rollout-tier feature flag (default disabled/internal-only) — exercising it meaningfully in Playwright needs that gating understood and configured correctly, which deserved more care than this pass's remaining time allowed.

## Never changed

Diagnostic reasoning, the Probability/Confidence/Evidence/Safety Engines, VIN decoding, the DTC database, feature flags, entitlements, and rate limits are untouched by this feature. Translation is applied strictly downstream of all of them, to already-computed English output, never influencing what gets computed.
