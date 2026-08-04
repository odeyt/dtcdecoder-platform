# Language Generation Architecture — Why Translate, Not Regenerate

This document exists specifically to record a decision that was requested one way and built another way, on purpose, with the requester's explicit sign-off — so nobody re-litigates it from a stale assumption later.

## The request vs. what was built

The originating request said: *"This must use native generation, not post-generation translation."* — i.e., independently generate the diagnosis in Thai, independently in Lao, independently in English, for the same case.

What was built instead, and kept from the pre-existing architecture: generate **once**, in English, then **translate** that fixed text into every other requested language. This was raised explicitly as a tradeoff before any code was written, and the owner chose to keep the translation architecture. Two structural reasons drove that choice:

### 1. Drift risk

Two independent AI generations for the same case *can disagree* — different ranked causes, different confidence levels, different recommended tests — simply because they're two separate model calls, not two views of one answer. For a diagnostic tool people use to decide what to actually repair on a real vehicle, a Thai-language answer and an English-language answer for the *same case* silently disagreeing is a real integrity problem, not a cosmetic inconsistency. Translation of one canonical answer structurally cannot drift from itself.

### 2. Cost

Native per-language generation multiplies AI cost by the number of supported languages, for every case, every turn. Translation is a single fixed-cost pass over already-generated text, using a cheaper/faster model tier (`scanReportTranslation` routes to `CLAUDE_HAIKU_4_5` — see `model-routing.ts` — not the full reasoning model the diagnosis itself uses).

## What "generation" actually means in this app, precisely

To be exact about where the line is drawn, since "generation" can mean different things at different layers:

- **The diagnosis itself** (ranked causes, hypotheses, recommended tests, safety classification) is generated exactly once, in English, by the existing Anthropic diagnostic provider (`AnthropicDiagnosticProvider`). This feature added **zero** new calls to that provider and changed **zero** lines of its prompts, schemas, or reasoning logic.
- **Translation** is a separate, second AI call (`AnthropicTranslationProvider`) over the *already-generated* English text, instructed to translate faithfully and preserve every technical token — not to reason, not to re-diagnose, not to reconsider anything. See `turn-localization.ts`'s system prompt: *"Do not add, remove, reinterpret, re-rank, or reorder any diagnostic content. This is a translation task, not a new diagnosis."*
- **Deterministic, non-AI content** (the Repair Verification checklist, the Diagnostic Question bank, `difficulty`/`risk`/`costLevel` derivation) was never AI-generated in either language in the first place — it's fixed template/keyword-matched content. "Native generation" doesn't apply to it at all; if/when it's localized (see `AI_LANGUAGE_LOCALIZATION.md`'s "What was deferred"), the right mechanism is next-intl message catalogs, matching every other static string in this app — not an AI call of any kind.

## Caching implication of this choice

Because generation and translation are separate steps, caching is also separate and simpler than a native-generation model would require: the English canonical result is the one source of truth; each locale's translation is a pure function of (canonical content, target locale, glossary version, prompt version, model) and can be cached and invalidated independently — see `turn-localization.ts`'s `computeTurnCacheKey()` and `report-localization.ts`'s `localizedReportCacheKey()`. A native-generation architecture would need a cache keyed the same way per language, but with no shared canonical source to invalidate against — every language's cache entry would need its own independent invalidation logic, and there would be no way to even detect that two languages' cached answers had drifted apart.

## If native generation is ever revisited

Should a future decision reverse this (e.g. a specific market genuinely needs region-specific reasoning, not just region-specific wording — different regulatory bodies, different common parts availability, etc.), that is a **new, explicit architecture decision**, not an extension of anything built in this pass. It would need its own drift-detection strategy (or an explicit acceptance that per-language answers may differ) and its own cost model, and should not be silently backed into by, e.g., someone assuming `AnthropicTranslationProvider` in `turn-localization.ts` could be swapped for a direct diagnosis call — it's typed narrowly around translating fixed text, not generating new content, on purpose.
