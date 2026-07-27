# Multi-Model Diagnostic Orchestrator

Provider-neutral, budget-controlled orchestration for Scan Report Analysis's AI diagnostic
step. Ships fully built but **disabled by default** (`AI_ORCHESTRATOR_ENABLED=false`) — with
the flag off, the app behaves byte-for-byte like it did before this feature existed: a single
call to `AnthropicDiagnosticProvider`, no router, no budget-guard aggregate check, no
`ai_routing_decisions` row ever written.

## Why this exists

Before this feature, exactly one AI provider (Anthropic) ran for every case, with no
deterministic decision about whether a case actually warranted the strongest (most expensive)
reasoning available. This introduces:

- A configurable **primary assessor** (OpenAI, when enabled — Anthropic remains the default).
- A deterministic **router** that decides, per case, whether a second opinion (an Anthropic
  **review**) is warranted — never "call every provider for every request."
- A **Gemini scaffold** for future multimodal work, disabled and uncalled today.
- An **aggregate budget guard** (daily/monthly/per-user USD spend) beyond the pre-existing
  per-request cost ceiling.
- A **routing-decision log** so every case's provider choice and escalation reason is
  auditable after the fact.

## What already existed and was extended, not duplicated

This app already had significant AI-cost infrastructure before this feature — see the
audit in this feature's implementation history. The orchestrator **extends** these, it does
not replace or duplicate them:

| Concern | Pre-existing module | What the orchestrator adds |
|---|---|---|
| Provider abstraction | `src/lib/scan-diagnostics/ai/provider.ts` (`DiagnosticAIProvider`) | New `DiagnosticReviewer` interface (additive) for the reviewer role |
| Usage/idempotency | `src/lib/ai-diagnostics/usage.ts` (`ai_diagnostic_usage`, unique on `(user_id, request_id)`) | Unchanged — the orchestrator's primary call still uses the case's own `caseId` as the idempotency key |
| Per-request cost ceiling | `src/lib/ai-diagnostics/cost.ts` (`guardCostCeiling`) | Extended pricing table to also price OpenAI/Gemini models (env-configurable); new aggregate daily/monthly/per-user budget guard (`budget-guard.ts`) |
| Deterministic safety review | `src/lib/scan-diagnostics/safety-rules.ts` | Unchanged — still the final deterministic safety pass on the merged output |
| Confidence scoring | `src/lib/scan-diagnostics/confidence.ts` | Unchanged — already written to accept `results.length > 1` for future multi-provider agreement, though the orchestrator's router (not this module) makes the escalation decision |
| Model routing (Anthropic tiers) | `src/lib/ai-diagnostics/model-routing.ts` | Unchanged (still governs which Anthropic model each Anthropic sub-task uses) |

## Architecture

```
src/lib/scan-diagnostics/ai/
  provider.ts           — DiagnosticAIProvider + DiagnosticReviewer interfaces
  shared-prompt.ts       — provider-neutral system/user prompt content (was anthropic-provider.ts)
  anthropic-provider.ts  — Anthropic: primary role (unchanged) AND reviewer role (new)
  openai-provider.ts     — OpenAI: primary role only
  gemini-provider.ts     — scaffold only, throws if ever called, no SDK installed
  review-schema.ts       — Zod schema for the reviewer's structured output
  review-merge.ts        — deterministic application of reviewer correctedFields
  router.ts              — decideRouting(): the RoutingReason engine
  registry.ts             — env-flag-driven provider selection (the ONLY place that picks a vendor)
  orchestrator.ts         — the full sequence, called from analyze.ts
  routing-log.ts          — persists one ai_routing_decisions row per orchestrated case

src/lib/ai-diagnostics/
  orchestrator-config.ts  — env-tunable thresholds/limits (fresh-read functions, not cached consts)
  budget-guard.ts          — aggregate USD budget state (normal/warning/restrict/hard_stop)
  cost.ts                  — extended: OpenAI/Gemini pricing, env overrides, never $0 for an unknown model
```

## Request sequence (when `AI_ORCHESTRATOR_ENABLED=true`)

```
1. Aggregate budget guard (computeBudgetState) — throws BudgetHardStopError at 100%,
   otherwise returns normal/warning/restrict.
2. Primary provider (registry.getPrimaryProvider(): OpenAI if OPENAI_PRIMARY_ENABLED,
   else Anthropic) runs — exactly ONE call.
3. Deterministic safety review (safety-rules.ts) + confidence score (confidence.ts) computed
   on the primary's raw output — purely for the ROUTER's decision, not yet persisted.
4. Router (decideRouting) picks exactly one RoutingReason and decides escalateToReview.
5. If escalating AND a reviewer is configured (registry.getReviewerProvider(): Anthropic,
   unless ANTHROPIC_REVIEW_ENABLED=false) — exactly ONE more call, the review.
6. Reviewer's correctedFields are merged deterministically (review-merge.ts) — the reviewer
   model never silently replaces the whole output.
7. The merged (or unreviewed) result flows back into analyze.ts's EXISTING, UNCHANGED
   pipeline: runSafetyReview -> computeConfidence -> assembleAndPersistReport.
8. A routing-decision row is persisted (routing-log.ts) — case-level summary, separate from
   the existing per-call ai_diagnostic_runs cost ledger.
```

Maximum 2 provider calls per case (primary + one optional review) — enforced structurally
(the orchestrator has no loop, no recursive call, and never calls a third provider for
ordinary cases) and by `AI_MAX_REQUESTS_PER_CASE` (default 2, clamped to a max of 2).

## Why not all three providers for every request

Cost and latency. The router's job is specifically to identify the ~15-25% of cases that
benefit from a second opinion (low confidence, safety-critical systems, contradictory
evidence, unsupported claims, quality-audit sampling) rather than doubling every request's
cost and wait time for no benefit on an ordinary, well-supported case. Gemini is never in
this loop at all today — it's scaffolded for a future multimodal (image/PDF-visual) role
that doesn't exist yet.

## Scope decision: chat vs. scan-report analysis

The orchestrator wires into **Scan Report Analysis** (`analyze.ts`) only, not into the DTC
Assistant chat feature. Chat is free-text/conversational; the orchestrator's schemas
(vehicle facts, DTC evidence, structured `DiagnosticAiOutput`) are built for the
structured scan-diagnosis flow. Forcing structured multi-provider routing onto chat would be
scope creep with no clear product benefit and a real risk of destabilizing an already-shipped,
simpler feature. Chat continues to use `src/lib/ai/assistant.ts` unchanged.

## No multi-tenant "shop" entity

This schema has no orgs/teams/shops table — `SubscriptionPlan` and every usage/budget check
is per-user. `AI_PER_SHOP_MONTHLY_BUDGET_USD` is evaluated as an alias of the requesting
user's own monthly spend (see `budget-guard.ts`), not silently ignored and not backed by a
fabricated shop concept.

## Rollback

Set `AI_ORCHESTRATOR_ENABLED=false` (the default) — every new module simply goes unused.
No migration needs reverting: `ai_routing_decisions` (migration 0029) is additive-only and
harmless if never written to. See `docs/AI_ORCHESTRATOR_ROLLOUT.md` for the full rollout/
rollback runbook.

## Known limitations

- No live OpenAI/Gemini API keys have been tested against a real account in this pass — the
  OpenAI provider is verified against a mocked SDK client only (see `test/ai-orchestrator-openai-provider.test.ts`).
- "Network topology uncertainty" (one of the spec's original trigger conditions) has no
  deterministic signal available today and is not implemented as a distinct router trigger —
  documented here rather than fabricated.
- The router's `UNSUPPORTED_CLAIM` detector is a conservative regex for pin-number/torque-
  value mentions; it does not attempt to verify measurement values against any reference data
  (this app has none to check against).
- `PREMIUM_CONSENSUS` and Gemini's real multimodal role are scaffolded (a real trigger/config
  point exists) but have no actual product feature behind them yet.
