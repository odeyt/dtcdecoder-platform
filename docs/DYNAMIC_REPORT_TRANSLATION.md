# Dynamic Report Translation

How DTCDecoder localizes dynamic diagnostic output (as opposed to static UI,
which uses language packs — see CONTENT_LOCALIZATION_ARCHITECTURE.md).

## Canonical-first architecture (implemented)

```
User request
  → English canonical diagnosis generated ONCE (streamAssistantResponse)
  → translateDiagnosticText(englishText, targetLocale, languageName, glossary)
  → glossary-protected translation of the FIXED English text
  → protected-token preservation check
  → localized output
```

- **Single source of truth.** The diagnosis is produced once in English; the
  target-language output is a *translation of that fixed English*, never an
  independent re-diagnosis (`src/app/api/ai/assistant/route.ts`). This prevents
  the English answer and a localized answer from drifting to different
  conclusions over the same grounding data.
- **Glossary protection.** `buildTranslationSystemPrompt` injects approved
  `terminology_glossary` terms (verbatim for `do_not_translate`).
- **Server-only.** All provider (Anthropic) calls happen server-side; no key
  reaches the browser.

## Protected-token preservation (this change)

`src/lib/ai/token-preservation.ts` — `verifyTokenPreservation(source,
translation)` extracts protected technical tokens from the canonical English
and confirms each survives in the translation:

- DTC codes (`P0420`, `U0101-00`), 17-char VINs, module/network acronyms
  (PCM/ECM/TCM/BCM/BECM/ABS/SRS/CAN/LIN/FlexRay/MOST/DTC/…), measurements with
  units (`12 V`, `5 V`, `60 Ω`, `45 Nm`, `90 °C`), `Bank 1 Sensor 2`,
  `DLC pin 6`, `CAN High`/`CAN Low`.
- Returns `{ ok, missing }`. `ok=false` means the translation must not be
  trusted.

### Enforcement points

- **AI assistant (streaming):** the check runs after the translation completes
  and **logs** any dropped token (`console.warn`). Because the translation is
  streamed live, it cannot be retracted mid-stream — the log surfaces
  glossary/prompt gaps for correction. Unit-tested in
  `test/token-preservation.test.ts`.
- **Stored localized reports (`TranslationProvider`):**
  `src/lib/ai/translation-provider.ts` defines the `TranslationProvider`
  interface and `AnthropicTranslationProvider`, which:
  - serves the canonical directly for an English request (not a fallback),
  - runs `verifyTokenPreservation` on the translation and, on failure, returns
    the English canonical with `status:"fallback"`, `fallbackUsed:true`, and the
    `missingTokens` list,
  - on a provider error (timeout/API) returns English with `status:"failed"`,
    `fallbackUsed:true` — the caller MUST NOT consume paid translation quota,
  - returns full audit metadata (provider, model, glossaryVersion,
    promptVersion, resolvedLocale, translatedAt, latencyMs).
  The translate step is injected, so the fallback/validation/metadata logic is
  unit-tested without a live key (`test/translation-provider.test.ts`).

  **Persistence is NOT yet built.** The `diagnostic_reports` /
  `diagnostic_report_localizations` tables (migration `0007`) were never applied
  to production and are not referenced by any `src/` code — orphaned scaffolding
  (see CONTENT_LOCALIZATION_AUDIT.md). So `AnthropicTranslationProvider` today
  returns a `LocalizedDiagnosticReport` object that nothing persists yet. Wiring
  a stored-localization writer requires first deciding which live flow (the
  streaming assistant vs. scan-diagnostics `scan_reports`) owns the canonical
  report, then a migration that creates the persistence table with the audit
  columns (`source/requested/resolved_locale, provider, model, glossary_version,
  prompt_version, fallback_used, translated_at, latency_ms`). A premature
  columns-only migration was reverted because its target table does not exist.

### Caching

`localizedReportCacheKey({canonicalReportId, reportVersion, targetLocale,
glossaryVersion, promptVersion, provider, model})` is the deterministic cache
key. Any change to the canonical report/version, glossary, prompt, provider, or
model yields a new key (invalidation). Failed/fallback results must not be
cached as successful.

## Fallback rules

```
Requested localized report → cached localized report → provider translation → English canonical
```

Never serve: a blank report, raw translation keys, or an unvalidated
translation that failed the protected-token check.

## Entitlements

`getAllowedOutputLocales(plan)` gates offered report languages by plan and the
DB `ai_output_enabled` flag. Report output is currently offered in English +
Spanish; extending to other locales is a product/safety decision, tracked
separately. Usage is reserved before generation (`recordAiDiagnosticUsage`) and
released on failure (`releaseAiDiagnosticUsage`) so a failed generation or
translation never consumes a slot.

## Providers / MCP

Anthropic today. A `TranslationProvider` interface (Anthropic/OpenAI/Gemini)
is a planned thin extraction of `translateDiagnosticText`. **MCP is not used or
required** — it would only apply to an external translation-management system.

## Not verified with a live key

The token-preservation logic is unit-tested against representative strings, not
a live provider response. No language is human-verified; all non-English output
is AI-generated beta.
