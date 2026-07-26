# Content Localization Audit (Phase 0)

Date: 2026-07-26. Branch: `feat/layered-localization`. Audit only — no code
changed in this document. Classifies each spec requirement against the existing
repository so we extend, not rebuild.

Legend: **PASS** = fully implemented · **PARTIAL** = core exists, gaps noted ·
**MISSING** = not implemented · **BLOCKED** = needs external input.

## Layer 1 — Static UI (language packs)

| Requirement | Status | Evidence / gap |
|---|---|---|
| next-intl config + locale routing | **PASS** | `src/i18n/request.ts`, `src/proxy.ts` (locale gating), `src/app/[locale]/` tree |
| Translation catalogs, English canonical | **PASS** | `messages/<locale>.json`, 12 live locales, 216-key parity |
| Catalog parity tests | **PASS** | `test/catalog-parity.test.ts` (CI-enforced) |
| Landing page via packs | **PASS** | hero/home/features/monetization/emailSignup/footer namespaces; no runtime AI |
| Navigation & buttons via packs | **PASS** | `nav`, `common` namespaces; `SiteNav`/`SiteFooter` use `useTranslations` |
| Pricing & features via packs | **PASS** | `pricing` namespace; locale-aware currency via `currency.ts` (billing stays USD) |
| SEO metadata via packs | **PASS** | `meta` namespace + `generateMetadata` per page; localized titles live |
| Account & preferences via packs | **PASS** | `account`, `preferences` namespaces |
| Missing UI keys → English | **PASS** | next-intl fallback; parity test prevents drift |
| No raw keys shown | **PASS** | verified in prod |
| Language selector (native names, a11y) | **PASS** | `LanguageSwitcher.tsx`; `test/language-menu.test.ts` |
| Catalog file-per-locale vs split dirs | **PARTIAL** | spec suggests `messages/<locale>/<ns>.json`; repo uses one file per locale with internal namespaces. Working + parity-tested — **keep** (spec allows preserving convention). Splitting is optional, not required. |

**Layer 1 verdict: effectively COMPLETE.** Do not rebuild. Remaining nit:
catalog directory split is optional and NOT recommended (would churn a working,
tested loader for no functional gain).

## Layer 2 — Dynamic DTC report (server-side AI translation)

| Requirement | Status | Evidence / gap |
|---|---|---|
| Canonical-English-then-translate flow (single diagnosis, anti-drift) | **PASS** | assistant route generates English then translates the fixed text — this behavior is real and live |
| Glossary-protected translation | **PASS** | `translateDiagnosticText` + `buildTranslationSystemPrompt` inject `terminology_glossary` |
| Technical-token preservation | **PASS** | translation prompt enumerates DTC/VIN/acronyms/measurements/CAN/connector rules; + `verifyTokenPreservation` post-check |
| Server-only provider, no client keys | **PASS** | Anthropic calls in server routes only |
| **Per-locale report PERSISTENCE store** | **MISSING (corrected 2026-07-26)** | `diagnostic_reports` + `diagnostic_report_localizations` are defined in migration `0007` but **that migration was NEVER applied to production** (`relation does not exist`) and **no `src/` code references either table**. The tables are orphaned scaffolding. The live assistant translates on the fly and stores English+translated text in `search_history`; scan-diagnostics uses `scan_reports` (0013). There is no canonical-report + per-locale-localization persistence in the running app. A prior version of this audit wrongly marked this PASS by reading migration files instead of the live DB. |
| Entitlement gating of output locales | **PASS** | `getAllowedOutputLocales(plan)` (plan + `ai_output_enabled`) |
| Usage reservation + refund on failure | **PASS** | `recordAiDiagnosticUsage` / release; failed attempt never consumes a slot |
| Report offered in all 12 locales | **PARTIAL/BLOCKED** | only `ai_output_enabled` locales (en+es) offered; extending to beta locales is a **pending safety decision** (translating safety-critical prose unreviewed) |
| Formal `TranslationProvider` interface | **PARTIAL** | logic exists as `translateDiagnosticText` function; not extracted to the spec interface with `sourceLocale/glossaryVersion/promptVersion` |
| Report translation metadata columns | **PARTIAL** | have `translation_status`, `generated_at`; **MISSING**: `source_locale, requested_locale, resolved_locale, provider, model, glossary_version, prompt_version, fallback_used, translated_at, latency_ms` |
| Deterministic translation cache + invalidation | **PARTIAL** | localizations table caches by (report, locale) but not keyed on glossary/prompt/provider/model version; no explicit invalidation rules |
| Schema validation of translated JSON | **PARTIAL** | report output is streamed text today, not a validated structured `LocalizedDiagnosticReport` JSON |

**Layer 2 verdict: architecture PASS, instrumentation PARTIAL.** Extend: add
metadata columns, extract the provider interface, add versioned cache keys.

## Symptom normalization

| Requirement | Status | Evidence / gap |
|---|---|---|
| Preserve original text | **PASS** | `diagnostic_reports.source_message`, scan `original` retained |
| Language detection stored | **PARTIAL** | `detected_source_language` column exists; no `detection_confidence` |
| Technical-token extraction | **PARTIAL** | `scan-diagnostics/parsers/dtc-extraction.ts` extracts DTCs; not a general token extractor tied to symptom text |
| Canonical English normalized form stored | **MISSING** | no `canonical_normalized_text` / `technical_tokens` / `requested_output_locale` on the symptom record |
| Formal `SymptomNormalizer` interface | **MISSING** | not present |
| Selected output locale overrides detection | **PARTIAL** | output locale is explicit in the assistant; detection doesn't drive output today |
| Low-confidence detection must not block | **PASS (by absence)** | detection is non-blocking today |

**Symptom normalization verdict: PARTIAL/MISSING.** Formal normalizer +
storage fields are the main new build.

## Safety warnings (reviewed pack + English fallback)

| Requirement | Status | Evidence / gap |
|---|---|---|
| Safety review runs on output | **PASS** | `scan-diagnostics/safety-rules.ts` `runSafetyReview` + `redactBlockedContent`; `safety_warnings jsonb` on scan reports; Diagnostic Safety v2 (migration 0015) |
| Reviewed **per-locale** safety pack table | **MISSING** | warnings are English rule messages; no `safety_warnings` locale table with `safety_code/severity/reviewed_translation/review_status/reviewed_by/version` |
| English fallback, never omit warning | **PASS (English)** | warnings always present in English |
| High-severity never uses experimental translation | **MISSING (enforcement)** | no locale-translation path for warnings yet, so trivially not violated — but the reviewed-pack + gate must be built before any localized safety output |

**Safety verdict: English PASS, localized reviewed pack MISSING.** This is the
highest-care new build; must be reviewed content, not runtime AI.

## Glossary (controlled automotive terminology)

| Requirement | Status | Evidence / gap |
|---|---|---|
| Glossary table + protection applied | **PASS** | `terminology_glossary` (term_en, locale_code, translated_term, category, do_not_translate, safety_critical, review_status, glossary_version); injected into translation prompt |
| Admin CRUD tools | **PASS** | `src/app/(app)/admin/glossary/` (list, new, [id] edit) under admin layout |
| Spec columns: acronym, manufacturer_context, system_context, alternative_translation, reviewed_by, reviewed_at | **PARTIAL/MISSING** | `category` exists; others absent |
| Protected-token validation AFTER translation | **MISSING** | preservation is prompt-instructed but not post-validated/repaired programmatically |
| Glossary version recorded in report audit | **PARTIAL** | glossary exists/versioned, but not stamped onto the localized report record (see Layer 2 metadata) |

**Glossary verdict: PARTIAL.** Extend columns + add post-translation token
validation; wire glossary_version into report metadata.

## Cross-cutting

| Requirement | Status | Evidence / gap |
|---|---|---|
| Static generation intact | **PASS** | `generateStaticParams` pre-renders `en`; `setRequestLocale`/`getTranslations` used; build clean |
| hreflang / x-default correct, gated by `seo_enabled` | **PASS** | `buildLocaleAlternates`; beta locales `seo_enabled=false` (not indexed) |
| Security: server-only keys, no client secrets | **PASS** | AI in server routes; env via `src/lib/env.ts` |
| RLS on preferences/report history | **PASS** | RLS policies in migrations 0006/0007/0016 |
| Free users can't forge paid entitlements | **PASS** | server-side `getEffectivePlan`/`getAllowedOutputLocales`; no client trust |
| Prompt-injection can't override token rules | **PARTIAL** | prompt-hardened + `scan-prompt-injection.test.ts` exists; post-translation token validation would strengthen |
| MCP not required | **PASS** | no MCP used for translation |
| Keep separate from Redlined1 | **PASS** | standalone repo |

## Build gap summary (what this program actually adds)

1. **Report translation metadata columns** + wire them (Layer 2). — additive migration.
2. **`TranslationProvider` interface** extraction around existing logic. — refactor, low risk.
3. **Versioned translation cache** key + invalidation rules.
4. **Structured `LocalizedDiagnosticReport` schema** + post-translation token validation.
5. **`SymptomNormalizer`** interface + normalization storage fields.
6. **Reviewed per-locale safety-warning pack** table + fallback gate (highest care).
7. **Glossary column extensions** (acronym/context/alt/reviewer) + admin fields.
8. **Report-output enablement** for beta locales — BLOCKED on the safety decision.
9. Expanded test matrix (report preservation, normalization, safety, glossary auth) + the 4 docs.

## Blocked / decision-required

- **Enabling report output / safety translation into human-unreviewed beta
  locales** (esp. Lao/Khmer) is a product+safety decision, not a code gap.
  Everything localized so far is AI-translated **beta, not human-verified**.
- No translation-provider key is exercised in tests; provider behavior
  (timeout/retry/refund) will be unit-tested with mocks, not a live key.
