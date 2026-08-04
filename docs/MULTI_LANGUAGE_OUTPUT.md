# Multi-Language AI Output — Supported Languages & Content Quality

## Supported languages today

English (`en`), Thai (`th`), Lao (`lo`) — per this feature's request — plus every other locale already live in this app's next-intl catalog (`LIVE_LOCALES` in `src/lib/i18n/locale-codes.ts`: `es`, `fr`, `vi`, `km`, `zh-CN`, `pt-BR`, `de`, `ja`, `ko`). AI-*output* translation specifically (not just static UI chrome) is additionally gated per-locale by `languages.ai_output_enabled` in the database — as of this writing that's `true` for `en`/`es` only; Thai/Lao's UI chrome is live but their AI-output flag is still `false`, a content-verification decision for whoever owns that rollout, not something this feature flips automatically (see `REGION_PROFILE_SETUP.md`'s identical note for the Region Profile System).

## Architecture supports unlimited future languages without code changes

Adding a new AI-output language is a **data change**, not a code change, in every pipeline this feature touches:

1. The locale must already be registered in `LOCALE_CODES` (`locale-codes.ts`) — a static superset already listing ~50 languages.
2. Set `languages.ai_output_enabled = true` for that locale in the admin `languages` table (or via `/admin/languages`).
3. Nothing in `ai-language-resolver.ts`, `turn-translation.ts`, `localized-turn.ts`, or `turn-localization.ts` branches on a specific locale code — they're all generic over whatever locale is requested, exactly like the scan-report pipeline they mirror.

## Technical Terminology Dictionary

The mechanism requested (a controlled glossary ensuring consistent automotive terminology across languages) **already exists** — it wasn't built by this feature, it was found already built: `terminology_glossary` table (migration `0006`, extended `0020`), consumed via `listGlossaryForLocale(locale)` in `src/lib/i18n/languages.ts`, and injected into every translation system prompt (both the scan-report path and this feature's new Diagnostic Engine turn path) as "approved terminology — use these exact renderings."

### Honest content status

As of this writing: **8 rows total, all `locale_code = 'es'`.** Zero rows for Thai, Lao, or any other locale. This mirrors the existing Spanish glossary's own migration comment: "a handful of representative, hand-reviewed terminology entries... proving the protection mechanism... not a claim that Spanish's glossary is complete."

This feature did **not** bulk-generate Thai/Lao glossary content. Machine-generating dozens of automotive terminology pairs (the kind of table shown in this feature's own request — Crankshaft Position Sensor, Fuel Pump, Ignition Coil, Ground, Open Circuit, etc.) without native-speaker technical review would be exactly the kind of fabricated-quality claim this codebase's own conventions explicitly refuse to make elsewhere (see `CONTENT_LOCALIZATION_ARCHITECTURE.md`'s treatment of translation-quality tiers). A technician relying on a mistranslated "Ground" or "Open Circuit" term is a real safety-adjacent risk, not a cosmetic one.

**What exists and works without glossary content**: the JSON-array translation system prompt already instructs the model to preserve every DTC code, VIN, part number, connector/pin name, wire color, module acronym, voltage/pressure/torque value and unit, calibration ID, and TSB number verbatim, with or without a glossary entry — see `turn-localization.ts`'s (and `report-localization.ts`'s) prompt text and `verifyTokenPreservation()`'s enforcement of it. The glossary is an *additional* consistency layer on top of that baseline protection, not the only thing preventing a garbled technical term.

### Recommended follow-up (not done in this pass)

Populate `terminology_glossary` for `th`/`lo` through the same review workflow the Spanish rows imply existed (`review_status = 'approved'`) — ideally with a native-speaking automotive technician reviewing entries before they're marked `approved`/`reviewed` (the only statuses `listGlossaryForLocale` actually serves), not this feature guessing at translations.

## Quality expectations set by the existing translation prompt

Both the scan-report and Diagnostic Engine turn translation prompts already instruct the model to "write naturally... not a stilted word-for-word rendering" — the "avoid machine-translated wording" requirement from this feature's own request was already satisfied by the existing prompt design this feature reused, not something newly added.
