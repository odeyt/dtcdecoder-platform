# Phase 1 Branding Standard

Canonical customer-facing branding for DTCDecoder's Phase 1 transformation
(docs/PHASE_1_DTC_TECHNICIAN_AUDIT.md). Enforced by
`src/lib/branding/terminology.ts` and `test/phase1-branding.test.ts`.

## Brand identity

| Element | Value |
|---|---|
| Primary expert name | **DTC Technician™** |
| Subtitle | **Professional Diagnostic Copilot** |
| Report title | **Professional Diagnostic Report** |
| Report attribution | **Prepared by DTC Technician™** |
| Standard disclosure | "DTC Technician provides software-assisted diagnostic guidance and is not an in-person technician. Confirm test procedures and repair decisions using appropriate service information and professional judgment." |

## Approved terminology map

See `APPROVED_TERMINOLOGY_MAP` in `src/lib/branding/terminology.ts` for the
full from→to table (DTC Lookup→Quick Code Lookup, AI Assistant→DTC
Technician™, Chat→Diagnostic Consultation, AI Report→Professional
Diagnostic Report, Upload Scan→Import Vehicle Scan, etc.) — that file is
the single source of truth; this doc summarizes it, not duplicates it.

## Prohibited customer-facing terms

`PROHIBITED_CUSTOMER_FACING_TERM_PATTERNS` in the same file: chatbot,
ChatGPT, GPT, Claude, Anthropic, Gemini, LLM, "model routing", prompt,
"AI-generated", "ask AI". Enforced against every migrated translation
namespace by `test/phase1-branding.test.ts`.

**Exceptions (never scanned, by construction):**
- Legal/disclosure pages (`src/app/(app)/{ai-disclaimer,terms,privacy,...}`)
  are plain hardcoded-English components, not sourced from `messages/*.json`
  — they may say "AI" where legally/transparently required.
- Admin/developer screens (`/admin/*`).
- Internal code comments and documentation.
- Internal implementation identifiers — see below.

## Internal identifiers are explicitly out of scope

Only user-visible copy changes. These keep their existing names
unconditionally: `AnthropicDiagnosticProvider`, `OpenAiDiagnosticProvider`,
`GeminiDiagnosticProvider`, `DiagnosticAIProvider`/`DiagnosticReviewer`
interfaces, `modelForTask`/model-routing internals, `chatMessages`-shaped
local component state, `ai_diagnostic_usage`/`ai_diagnostic_runs`/
`scan_ai_runs` table and column names, analytics event type identifiers
(`ai_diagnosis_cta_clicked`, etc.). `test/phase1-branding.test.ts` pins
that the provider class names specifically are never renamed.

## What changed and where (by slice)

| Slice | Surface | Namespace(s) / files |
|---|---|---|
| 1 | The "AI Assistant" feature itself | `messages/*.json` `aiAssistant` → `dtcTechnician` (all 12 locales, structural rename; en/es fully translated) |
| 2 | Landing hero | `hero`, new `landingIntake` namespace |
| 5 | Consultation shell | New `dtcTechnicianShell` namespace |
| 6 | Nav, footer, home, pricing, account, preferences, dtcResult, dtcSearch, history, meta; `ScanReportView.tsx` report labels; `/diagnostics/*` pages | en/es values updated in place (keys unchanged) |
| 7 | Thai catalog | `th.json` brought to terminology parity (not a live/routable locale — see audit) |

## Known limitation

Non-live locales other than Thai (de/fr/ja/km/ko/lo/pt-BR/vi/zh-CN) received
only a **structural** key rename (`aiAssistant`→`dtcTechnician`,
`landingIntake`/`dtcTechnicianShell` added) with English placeholder
content for the new/renamed values — they are not reachable by real
visitors (`isLiveLocale()` gates them to the English catalog), so this is
inert, not a live-traffic content bug. A full re-translation pass for those
locales is a natural follow-up once/if any of them goes live.
