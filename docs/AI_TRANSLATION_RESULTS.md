# AI Translation Validation Results

## Status: BLOCKED

**Reason: Missing `ANTHROPIC_API_KEY`.**

No Anthropic API key is available in this environment (confirmed absent from
`.env.local` — see the environment audit in the production certification report). The
AI diagnostic assistant and the translation pipeline (`translateDiagnosticText` in
[`src/lib/ai/assistant.ts`](../src/lib/ai/assistant.ts)) require this key to function
at all — this blocks not just translation, but the entire AI assistant feature,
English included.

Per this project's standing rule (never claim AI verification without a real key and a
real successful request), **no test was run and no results are fabricated below.**

## What was requested

Generate diagnostic reports for **P0420, 2018 Toyota Camry** in:

- English
- Spanish
- Lao
- Arabic
- Chinese (Simplified)
- Thai

And verify: DTC code unchanged, VIN unchanged, module acronyms preserved, CAN
terminology preserved, measurements preserved, safety warnings preserved, and root
cause ordering identical across languages.

**Note on scope:** "Confidence identical," "Agreement identical," and "Safety score
identical" were also requested. These do not correspond to anything in the current
implementation — there is no multi-model consensus pipeline (no OpenAI, no Gemini),
and no confidence/agreement/safety scoring exists anywhere in the codebase. This was
an explicit, deliberate decision made earlier in this project: the AI pipeline is
single-Claude only (generate the diagnosis once in English, translate a fixed text for
other languages — see
[`LOCALIZATION_ARCHITECTURE.md`](LOCALIZATION_ARCHITECTURE.md)), specifically to avoid
fabricating consensus metrics that don't reflect real multi-model agreement. If a
future spec genuinely requires a multi-provider consensus pipeline, that's a real
architecture change requiring new vendor integrations and cost — not something this
report can retroactively claim already exists.

The five preservation checks that *do* map to the real translation system prompt (DTC
code, VIN, module acronyms, measurement values + units, and a structural
ordering heuristic) are exactly what
[`scripts/test-ai-translation.mjs`](../scripts/test-ai-translation.mjs) is built to
check, per [`AI_TRANSLATION_LIVE_TEST.md`](AI_TRANSLATION_LIVE_TEST.md).

## What would happen once a key is available

Run:

```bash
ANTHROPIC_API_KEY=sk-ant-... node scripts/test-ai-translation.mjs
```

This exercises the same 5 non-English test locales already documented (Spanish, Lao,
Arabic, Chinese Simplified, Thai) against the same canonical P0420/2018 Camry case
requested here, checks DTC code / VIN / module acronym / measurement-unit
preservation, and a structural (list-ordering) heuristic. Update this file with the
actual pass/fail table once it's been run for real — do not mark this BLOCKED status
as resolved until that's happened.

| Language | DTC preserved | VIN preserved | Acronyms preserved | Measurements preserved | Structure preserved | Result |
|---|---|---|---|---|---|---|
| English (canonical) | — | — | — | — | — | Not generated — no key |
| Spanish | — | — | — | — | — | Not generated — no key |
| Lao | — | — | — | — | — | Not generated — no key |
| Arabic | — | — | — | — | — | Not generated — no key |
| Chinese (Simplified) | — | — | — | — | — | Not generated — no key |
| Thai | — | — | — | — | — | Not generated — no key |

**"Confidence identical" / "Agreement identical" / "Safety score identical":** not
applicable — no such metrics exist in this implementation. Not tested, not faked.
