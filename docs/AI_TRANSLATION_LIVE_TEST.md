# AI Translation Live Test

Status as of this writing: **NOT RUN.** No `ANTHROPIC_API_KEY` was available in this
environment during development, so the script below has been written and reviewed but
never executed against the real Anthropic API. Do not treat live AI translation as
verified until someone runs it with a real key and the summary below is updated with
actual output.

## What this tests

The app's non-English AI diagnostic output works in two steps (see
[`src/lib/ai/assistant.ts`](../src/lib/ai/assistant.ts)):

1. Generate the diagnostic answer in English (`streamAssistantResponse`) — always, for
   every user, regardless of their preferred output language.
2. If the user's `outputLocale` isn't English, translate that fixed English text with a
   second, separate call (`translateDiagnosticText`) — never regenerate the diagnosis
   directly in the target language.

This split is what keeps the canonical record and its translations consistent: the
diagnosis is decided once, in English, and every other language is a faithful
translation of that fixed text, not an independently-reasoned answer that could reach a
different conclusion.

`scripts/test-ai-translation.mjs` exercises step 2 in isolation: one fixed English
diagnostic explanation (P0420, 2018 Toyota Camry) is translated into 5 languages, and
each translation is checked for the things the translation system prompt promises to
preserve verbatim.

### Why a standalone script instead of calling the app's own code

`src/lib/ai/assistant.ts` starts with `import "server-only"`, which throws when the
module is imported outside a Next.js server context (Server Component, Route Handler,
etc.). A plain Node script can't import it directly. Instead, the script duplicates the
exact system-prompt text from `buildTranslationSystemPrompt()`. **If that function's
wording changes, update the copy in the script to match** — the two are not
mechanically kept in sync, and a stale copy would silently test a prompt the app no
longer sends.

The script does not call the database, so it does not exercise `terminology_glossary`
injection — the live app additionally appends approved-terminology rows for the target
locale to the system prompt (see the `glossaryBlock` logic in `assistant.ts`). A locale
with a populated glossary may translate more accurately in production than in this test.

### Languages tested

| Locale | Language | Notes |
|---|---|---|
| `es` | Spanish | Tier 2 (AI output enabled) today — the one language currently live |
| `lo` | Lao | Tier 4 (registered, not yet activated) |
| `ar` | Arabic | Tier 4; RTL — tests translation quality independent of UI direction handling |
| `zh-CN` | Chinese (Simplified) | Tier 4 |
| `th` | Thai | Tier 4 |

These were chosen to cover a currently-active language (Spanish), a right-to-left
script (Arabic), and non-Latin scripts with very different structure (Lao, Chinese,
Thai) — not because all five are scheduled for activation.

### What "pass" means

For each language, the script checks that the translated text still contains, verbatim:

- The DTC code (`P0420`)
- The VIN (`JTDBE40E699012345`)
- The module acronym (`PCM`)
- The voltage range with units (`0.1–0.9V`)
- The torque value with units (`45 Nm`)

and a heuristic check that the two 4-item numbered lists in the source produced a
similar count of numbered-list markers in the translation (a proxy for "nothing was
reordered or dropped").

These checks are intentionally narrow — they only cover what
`buildTranslationSystemPrompt()` explicitly promises to preserve. They do **not**
score translation fluency, idiomatic quality, or medical/legal-style accuracy of
automotive terminology; that requires a native-speaking reviewer, not an automated
script. A "PASS" here means "the safety-critical tokens survived," not "this
translation is publication-quality." Tier activation for a new language should still
require human review per the support-tier process (`support_tier` in the `languages`
table), not just a passing run of this script.

## Running it

Requires a real `ANTHROPIC_API_KEY`. The script refuses to run without one and never
prints the key.

```bash
ANTHROPIC_API_KEY=sk-ant-... node scripts/test-ai-translation.mjs
```

On Windows PowerShell:

```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-..."
node scripts/test-ai-translation.mjs
```

Each run makes 5 real, billed API calls (`claude-sonnet-5`, low effort, ~2K max output
tokens each) — costs are small (well under $0.10 total at current per-token pricing)
but not zero.

The script prints a PASS/FAIL line per language, lists which specific checks failed for
any FAIL, and exits non-zero if any language failed. Exit code 1 also results from a
missing API key or an unexpected script error.

## After running it for the first time

Update this section with the actual result (date, model, pass/fail per language) so
future readers don't have to re-run it to know the current state:

> _Not yet run. No entry to report._
