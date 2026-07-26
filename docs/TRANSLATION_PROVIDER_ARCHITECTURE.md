# Translation Provider Architecture

How DTCDecoder localizes content. Two distinct paths — static UI vs. dynamic
diagnostic output — never mixed.

## 1. Static content (UI chrome)

Version-controlled next-intl catalogs at `messages/<locale>.json`. English
(`en`) is canonical; every other catalog is a full key-parity mirror
(enforced by `test/catalog-parity.test.ts`). Namespaces: nav, footer, hero,
home, common, auth, pricing, account, preferences, dtcResult, dtcSearch,
dtcError, emailSignup, aiAssistant, history, meta.

- Public content tree (`src/app/[locale]/`) resolves the catalog from the URL
  segment; the `(app)` shell resolves it from the `dtc_interface_locale`
  cookie / saved account preference (`resolveAppShellLocale`).
- Missing keys fall back to English (next-intl); raw keys are never shown.
- No AI/provider involved. Adding a language = add its catalog + `LIVE_LOCALES`.

## 2. Dynamic content (AI diagnostic reports / assistant)

**This pipeline already exists and is wired** — see
`src/app/api/ai/assistant/route.ts` and `src/lib/ai/assistant.ts`. It matches
the spec's required architecture:

```
User input
  → English canonical diagnosis generated first (streamed or buffered)
  → translateDiagnosticText(englishText, targetLocale, languageName, glossary)
  → glossary-protected, technical-token-preserving translation
  → localized output
```

Key properties:

- **English is the single source of truth.** The route generates the English
  answer, then translates that fixed text. It never runs an independent
  diagnosis per language (explicit anti-drift comment in the route), so the
  DTC code, ranked causes, test sequence, safety level, measurements, and
  recommended next step are preserved across languages.
- **Glossary protection.** `buildTranslationSystemPrompt` injects approved
  terminology from `terminology_glossary` (per locale), honoring
  `do_not_translate` (kept verbatim) and safety-critical flags.
- **Technical-token preservation** is enforced in the translation system
  prompt: DTC codes (P0420), VINs, part numbers, connector/pin names, wire
  colors, CAN High/Low, LIN/FlexRay/MOST, voltages/resistance/pressure/torque/
  temperature + units, module acronyms (PCM/ECU/ABS/…), calibration IDs, TSB
  numbers — copied unchanged.
- **Entitlement gating.** `getAllowedOutputLocales(plan)` returns the offered
  report languages, filtered by plan (free → English) **and** the DB
  `ai_output_enabled` flag per locale.
- **Provider.** Anthropic (`@anthropic-ai/sdk`). A `DiagnosticAIProvider`
  interface (`src/lib/scan-diagnostics/ai/provider.ts`) already abstracts the
  reasoning provider; the repo has no OpenAI/Gemini integration.

### Persistence

- `diagnostic_reports` — canonical English (`canonical_locale='en'` enforced by
  CHECK), never overwritten.
- `diagnostic_report_localizations` — one row per (report, locale) with
  `translated_text`, `translation_status` (pending/completed/failed),
  `generated_at`. Separate records; no conflicting diagnostic records.

## Proposed `TranslationProvider` interface (not yet extracted)

The spec's interface would be a thin formalization of the existing
`translateDiagnosticText` function — a future refactor, non-behavioral:

```ts
interface TranslationProvider {
  translateDiagnosticReport(input: {
    canonicalReport: CanonicalDiagnosticReport;
    targetLocale: SupportedLocale;
    glossaryVersion: string;
  }): Promise<LocalizedDiagnosticReport>;
}
```

Implementations (`AnthropicTranslationProvider`, and optional future
`OpenAITranslationProvider`/`GeminiTranslationProvider`) would be selected via
server-side config. **All calls are server-side; no API key reaches the
client.** Recommended additions when this is extracted: a translation cache
keyed by `(reportId, targetLocale, glossaryVersion, promptVersion)`, English
fallback on provider failure, and reserved-quota refund on failure (do not
count a failed translation as a successful paid translation).

## Safety note

Report output is currently offered only in locales with `ai_output_enabled=true`
(English + Spanish). Extending it to the beta UI locales would translate
safety-critical prose into human-unreviewed languages — a deliberate,
separate decision. Technical tokens are always preserved; prose quality in
unreviewed languages is machine-grade.

## MCP

MCP is **not** used or required for translation. It would only be introduced
to integrate an external translation-management system (Phrase/Lokalise/
Crowdin), which is not in scope.
