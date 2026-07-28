# Phase 2.1 — Observability and Cost Control

Every Diagnostic Engine turn attempt — completed, skipped, or failed — is recorded as one
structured, privacy-safe row via `src/lib/diagnostic-engine/observability.ts`
(`recordDiagnosticEngineRun`), backed by `diagnostic_engine_runs` (migration 0033). Never gates
anything; a logging failure is caught and `console.error`'d, never surfaced to the caller (same
best-effort convention as `ai-diagnostics/usage.ts`'s `recordAiDiagnosticRun` and
`analytics/events.ts`'s `recordEvent`).

## What's captured, per turn attempt

| Field | Captured for |
|---|---|
| `request_id`, `case_id`, `user_id`, `plan`, `rollout_tier` | every attempt |
| `provider_id`, `provider_called` | every attempt (`provider_called: false` for a skipped turn) |
| `skip_reason` | skipped turns only (`evidence_unchanged_since_graph`) |
| `prompt_cache_status` | completed turns (currently always `unknown` — see limitation below) |
| `input_tokens`, `output_tokens`, `estimated_cost_usd`, `latency_ms` | completed turns |
| `evidence_count`, `hypothesis_count` | every attempt |
| `graph_version` | when the graph was updated this turn |
| `confidence_band`, `safety_classification` | completed turns |
| `schema_validation_result` (`valid`/`invalid`/`not_applicable`) | every attempt |
| `status` (`completed`/`skipped`/`failed`), `failure_category` | every attempt |

## Known limitation: prompt-cache status

`prompt_cache_status` is always recorded as `"unknown"` today. `AnthropicDiagnosticProvider`
does mark its system prompt with Anthropic's `cache_control: { type: "ephemeral" }`
(`docs/PROBABILITY_ENGINE.md#cost-optimization`), but `DiagnosticAIProviderResult` doesn't yet
carry the Anthropic response's actual `cache_creation_input_tokens`/`cache_read_input_tokens`
usage fields back to the caller — extending that result type to surface real cache hit/miss data
is a small, low-risk follow-up, not done in this pass to avoid touching the shared
`DiagnosticAIProviderResult` shape every other provider caller also depends on without a
concrete need driving it yet.

## Failure classification

`classifyFailure(err)` maps a thrown error to one of a fixed set of categories
(`provider_timeout`, `provider_rate_limit`, `invalid_structured_response`,
`database_persistence_failure`, `entitlement_exhausted`, `feature_disabled`, `ownership_denied`,
`cost_ceiling_exceeded`, `unknown_error`) by inspecting the error's `name` (for the app's own
typed errors — `AiResponseValidationError`, `CostCeilingExceededError`,
`DiagnosticEngineLimitExceededError`, `ScanCaseNotFoundError`) or a small set of message-text
heuristics (timeout/rate-limit wording) for everything else. The raw error message/stack is never
persisted to this table — only the category — matching the existing convention in
`scan-diagnostics/api-errors.ts` of keeping raw error detail server-side (`console.error`) only.

## Privacy — what is deliberately NOT captured

`diagnostic_engine_runs` has no free-text column at all besides the fixed-vocabulary
`skip_reason`/`failure_category` (both `check`-constrained in the migration to a closed set of
values, so nothing arbitrary can ever land there). Specifically never logged, here or anywhere
else in the Diagnostic Engine:

- Full VINs, complaint text, symptom text, or technician notes (only aggregate counts like
  `evidence_count` — never the evidence values themselves).
- The rendered prompt sent to the AI provider.
- The AI's own free-text `summary`/reasoning content.
- Any customer personal information — this table has no name/email/phone column; it's keyed only
  by `user_id`/`case_id` (both opaque UUIDs).
- Provider API keys — read from `env.anthropicApiKey()` at call time, never persisted anywhere.
- Internal prompt content is never sent to the client either — the API only ever returns the
  already-structured `DiagnosticEngineResponse`, never the underlying prompt string.

## Cost estimation reused, not duplicated

`estimateCostMicros`/`computeActualCostMicros`/`guardCostCeiling`/`microsToUsd`
(`src/lib/ai-diagnostics/cost.ts`) are the same functions the Phase 0 scan-report path already
uses — no second pricing table or estimation formula was introduced for the Diagnostic Engine.
The turn's actual token usage (from the provider's real response) feeds `computeActualCostMicros`
for the observability row; the pre-flight estimate (from the rendered prompt's character length)
feeds `guardCostCeiling`, exactly like `analyze.ts`'s existing pre-flight guard.

## Where to look

- `select * from diagnostic_engine_runs where user_id = '<uuid>' order by created_at desc;` —
  a user's own turn history (owner-read RLS applies, same as every other Phase 2 table).
- `select failure_category, count(*) from diagnostic_engine_runs where status = 'failed' group by 1;`
  — failure-mode breakdown.
- `select count(*) filter (where status = 'skipped')::float / count(*) as skip_rate from diagnostic_engine_runs;`
  — how often cost optimization is actually avoiding a redundant call.
