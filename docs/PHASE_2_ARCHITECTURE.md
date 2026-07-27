# Phase 2 — Evidence-Based Diagnostic Engine

Transforms DTC Decoder from a one-shot "upload a report, get an AI paragraph back" tool into a
stateful diagnostic engine that reasons like a technician: collect evidence, generate ranked
hypotheses, ask the highest-value next question, update the graph, recompute probabilities,
repeat until confidence is high, then hand off to test planning / safety classification / repair
verification. Ships fully built but **every flag defaults off** (`feature-flags.ts`) — with all
six flags off, the app behaves exactly as it did before this phase existed, except that visiting
a case for the first time silently records its deterministic evidence (harmless, no AI call, no
UI change).

## Why this exists

Phase 1 built the DTC Technician landing/intake/consultation shell. It had no actual diagnostic
reasoning loop — "Scan Report Analysis" (Phase 0) is a single AI call producing one static
report; there was no evolving case state, no next-best-question logic, no ranked-hypothesis
tracking across turns. This phase adds that loop as a new, additive layer on top of the existing
`scan_cases` case entity, without touching Phase 0/1's existing flows.

## Core pipeline

```
User → Diagnostic Intake → Evidence Engine → Probability Engine → Question Engine
     → AI provider (existing DiagnosticAIProvider abstraction) → Response Formatter → User
```

Implemented end-to-end in `src/lib/diagnostic-engine/orchestrator.ts`'s `runDiagnosticEngineTurn`,
called from `POST /api/diagnostic-engine/v1/cases/[caseId]/turn`. Every module it sequences is
documented in its own file:

| Doc | Covers |
|---|---|
| [EVIDENCE_ENGINE.md](EVIDENCE_ENGINE.md) | Structured evidence model, deterministic derivation from a case, dedup |
| [DIAGNOSTIC_GRAPH.md](DIAGNOSTIC_GRAPH.md) | The evolving graph, node/edge kinds, versioning, merge semantics |
| [QUESTION_ENGINE.md](QUESTION_ENGINE.md) | Next-best-question selection, the fixed question bank, answer loop |
| [PROBABILITY_ENGINE.md](PROBABILITY_ENGINE.md) | Ranked hypotheses, categorical confidence, evidence attribution |
| [TEST_PLANNER.md](TEST_PLANNER.md) | Recommended-test ranking, drive-safety classification, repair verification |

## AI provider abstraction — reused, not rebuilt

The "AI provider must be interchangeable" requirement was already satisfied by the
Multi-Model Orchestrator phase's `DiagnosticAIProvider`/`registry.ts`
(see [MULTI_MODEL_ORCHESTRATOR.md](MULTI_MODEL_ORCHESTRATOR.md)). This phase adds one new
**optional** interface method, `runDiagnosticEngineTurn?(prompt: string)`
(`src/lib/scan-diagnostics/ai/provider.ts`), implemented only by `AnthropicDiagnosticProvider`
today. It's optional so the interface change is purely additive — OpenAI/Gemini scaffolds are
not forced to implement it, and nothing about Phase 0/1's `runDiagnosis` call changes.
`AnthropicDiagnosticProvider.runDiagnosis` and `.runDiagnosticEngineTurn` now share a
`callSubmitDiagnosisTool` helper (same tool schema, same `DiagnosticAiOutputSchema` parsing) —
only the system prompt and user content differ.

## Case memory

Every new table keys off the **existing** `scan_cases.id` — no parallel case entity. A case
started from a scan upload, quick DTC entry, or landing intake all work identically here, since
they all populate the same `scan_cases`/`scan_extractions`/`scan_dtc_records`/`scan_systems`
rows the Evidence Engine reads on its first turn.

`DiagnosticEngineTurnResult.hypotheses` is always populated from the persisted
`diagnostic_probabilities` snapshot — regardless of whether the current turn generated a fresh
one — so a page refresh (or a turn that skipped the AI call, see cost optimization below) never
loses the case's current diagnosis.

## Feature flags

All default `false` (`src/lib/diagnostic-engine/feature-flags.ts`, read fresh from `process.env`
per call, matching `ai-diagnostics/orchestrator-config.ts`'s convention):

| Flag | Gates |
|---|---|
| `DIAGNOSTIC_GRAPH_ENABLED` | Whether the graph is read/rebuilt/persisted this turn |
| `QUESTION_ENGINE_ENABLED` | Whether a next question is selected and persisted |
| `PROBABILITY_ENGINE_ENABLED` | Whether the AI provider is called at all — the master switch for `/turn`; the route 404s without it |
| `CONFIDENCE_ENGINE_ENABLED` | Whether a real (vs. zeroed placeholder) confidence breakdown is computed |
| `TEST_PLANNER_ENABLED` | Whether a ranked test plan is built from the AI's recommended tests |
| `REPAIR_VERIFICATION_ENABLED` | Gates the separate repair-verification routes (not part of a "turn") |

Evidence collection has no flag — it's foundational, not an optional module, per the spec's own
framing (the six flags cover Diagnostic Graph, Question Engine, Probability Engine, Confidence
Engine, Repair Verification, Test Planner — never Evidence Engine).

## Database

`supabase/migrations/0031_diagnostic_engine_core.sql` — six additive tables, all with owner-read
RLS matching the existing `scan_systems`/`scan_patterns` pattern (migration 0028): `diagnostic_evidence`,
`diagnostic_graph`, `diagnostic_questions`, `diagnostic_answers`, `diagnostic_probabilities`,
`repair_verifications`. **Not yet applied** to any Supabase project — present it to the project
owner for review before running it, same as every prior migration in this codebase.

## API

New, versioned, additive namespace — does not touch any existing `/api/scan-diagnostics/*` route:

| Route | Method | Purpose |
|---|---|---|
| `/api/diagnostic-engine/v1/cases/[caseId]/turn` | POST | Runs one full engine turn |
| `/api/diagnostic-engine/v1/cases/[caseId]/answers` | POST | Records an answer to the current question |
| `/api/diagnostic-engine/v1/cases/[caseId]/repair-verification` | GET/POST/PATCH | Read / generate / update a repair checklist |

All three gate on their relevant feature flag and return `404` when it's off, on top of the
usual auth + `getCaseForOwner` ownership check (never distinguishing "not found" from
"not yours").

## Deliberately deferred / open decisions

- **Report-count usage ledger.** A Diagnostic Engine "turn" is a much smaller, more frequent
  unit of work than a Phase 0 "full AI diagnostic report" (one turn per question answered, not
  one per case). Mapping it onto the existing per-report entitlement quota
  (`src/lib/ai-diagnostics/usage.ts`) would either exhaust a technician's monthly allowance after
  a few questions, or require a new pricing decision this phase's spec doesn't make. Not wired in
  this phase — a raw per-call cost-ceiling safety net (`guardCostCeiling`) IS applied, since
  that's a pure runaway-spend guard, not a pricing decision.
- **UI wiring.** This phase builds the engine and its API, not new consultation-shell UI. Wiring
  `AiAssistantChat.tsx`/`DtcTechnicianShell.tsx` to call `/turn`/`/answers` and render ranked
  hypotheses, the next question, and the confidence breakdown is follow-up work, not done here.
- **Cost optimization scope.** See [PROBABILITY_ENGINE.md](PROBABILITY_ENGINE.md) and
  `src/lib/diagnostic-engine/cost-optimization.ts` — redundant-call skipping only activates when
  `DIAGNOSTIC_GRAPH_ENABLED`, since the graph is the only persisted record of "what evidence did
  the last AI call already see." True prefix-level prompt caching of growing per-case context
  (vs. the system-prompt caching actually implemented) is left for a future pass.
