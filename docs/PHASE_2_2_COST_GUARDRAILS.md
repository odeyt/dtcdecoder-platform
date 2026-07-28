# Phase 2.2 — Cost and Budget Guardrails

The Diagnostic Engine had one cost control before this phase: a per-request cost ceiling
(`ai-diagnostics/cost.ts`'s `guardCostCeiling`, rejecting any single call estimated too expensive
to run at all). Nothing bounded *total* spend across many turns. This phase adds that: aggregate
global/per-user/internal-testing USD budgets, an emergency kill switch, and full cost
observability — all layered on top of, never duplicating, the existing per-request guard.

## Design: mirrors the existing scan-report/chat budget guard, doesn't merge with it

`src/lib/ai-diagnostics/budget-guard.ts` already implements exactly this pattern
(warning/restrict/hard_stop states, percent-of-limit thresholds, fresh-read-every-call) for
scan-report/chat spend, reading from `ai_diagnostic_runs`. The new
`src/lib/diagnostic-engine/budget-guard.ts` reuses the same state model and threshold logic but
reads from `diagnostic_engine_runs` — this feature's own cost ledger — for the same reason the
turn-count usage ledger (`diagnostic_engine_usage`, Phase 2.1) is separate from the report-shaped
one: pooling turn-shaped spend with report/chat spend would make either dimension meaningless on
its own.

**Provider pricing is never duplicated.** Every dollar figure this module sums was already
computed once, at record time, by the same centralized registry
(`ai-diagnostics/cost.ts`'s `computeActualCostMicros` / `MODEL_PRICING`) every other AI-calling
feature in this app uses. `budget-guard.ts` only aggregates already-computed costs — it contains
no pricing table of its own.

## Budget dimensions

| Env var | Dimension | Scope |
|---|---|---|
| `DIAGNOSTIC_ENGINE_DAILY_BUDGET_USD` | Global, today (UTC) | Every user, every turn |
| `DIAGNOSTIC_ENGINE_MONTHLY_BUDGET_USD` | Global, this month (UTC) | Every user, every turn |
| `DIAGNOSTIC_ENGINE_USER_DAILY_BUDGET_USD` | Per-user, today | The specific caller only |
| `DIAGNOSTIC_ENGINE_USER_MONTHLY_BUDGET_USD` | Per-user, this month | The specific caller only |
| `DIAGNOSTIC_ENGINE_INTERNAL_DAILY_BUDGET_USD` | Internal testers only, today | Only callers `resolveDiagnosticEngineAccess` marks `isInternal` |
| `DIAGNOSTIC_ENGINE_PROVIDER_KILL_SWITCH` | Emergency stop | Every call, checked first, ignores all other budgets |

Every dimension is `undefined` (unlimited) unless explicitly set — no implicit $0 ceiling. A
dimension only ever *restricts*; leaving all of them unset reproduces exactly today's behavior
(bounded only by the existing per-request ceiling).

**Internal testers are not unlimited by default.** They bypass the ordinary per-user/per-plan
turn-count limits (`entitlements.ts`'s `resolveDiagnosticEngineAccess`), but their $ spend still
counts toward the global daily/monthly dimensions, and once `DIAGNOSTIC_ENGINE_INTERNAL_DAILY_BUDGET_USD`
is set, it caps them specifically too.

## Enforcement pipeline (per turn, inside `orchestrator.ts`)

1. Resolve entitlement + internal status (`resolveDiagnosticEngineAccess`).
2. Resolve rollout tier (already checked at the route level before the orchestrator runs).
3. Check cost optimization — if evidence is unchanged since the graph last saw it, skip the AI
   call entirely (no budget check needed; nothing is about to be spent).
4. Estimate worst-case request cost (`estimateCostMicros`) and check the per-request ceiling
   (`guardCostCeiling`) — a request too large to ever safely run doesn't consume anyone's budget.
5. **Check the kill switch, then the aggregate budget state** (`isDiagnosticEngineKillSwitchActive`,
   `computeDiagnosticEngineBudgetState`, `assertDiagnosticEngineBudgetAllows`) — before the
   turn-count usage slot is reserved, so a request blocked here never consumes an entitlement slot
   either.
6. Reserve the turn-count usage slot atomically (`recordDiagnosticEngineUsage`,
   `pg_advisory_xact_lock`-guarded, idempotent on `(user_id, request_id)` — unchanged from Phase 2.1).
7. Call the provider.
8. On success: reconcile actual cost from real token usage (`computeActualCostMicros`), save
   hypotheses, record a `completed` observability row.
9. On failure: release the reserved usage slot (`releaseDiagnosticEngineUsage`), classify the
   failure, record a `failed` observability row — never a duplicate charge on retry, since the
   next attempt with the same `requestId` is idempotent at the usage-ledger level.

## Concurrency and idempotency

The turn-count reservation (`recordDiagnosticEngineUsage`) is genuinely atomic — a per-user
`pg_advisory_xact_lock` inside the RPC serializes concurrent calls for the same user, so two
simultaneous requests can't both pass a count check before either has inserted (see migration
0032's `record_diagnostic_engine_usage` function). The **aggregate $ budget check is a real-time
read, not a reservation** — matching the existing scan-report/chat budget guard's own established
tolerance (a fresh sum-over-window query, re-run on every call, never cached). Two requests
arriving within milliseconds of each other near a hard-stop boundary could both read "under
budget" and both proceed; the next request after either completes will see the updated sum. This
is an accepted, pre-existing tolerance level in this codebase, not a new gap introduced here — an
atomic $ reservation would require a materially more complex ledger (holding a reservation open
for the duration of a variable-length AI call) for a benign, self-correcting edge case.

## Safe error responses

`DiagnosticEngineBudgetExceededError` and `DiagnosticEngineKillSwitchError` both carry the exact
generic message the phase brief specifies:

> The diagnostic service is temporarily unavailable because its usage limit has been reached. Your
> case and evidence remain saved.

Neither error's `message` (what `toSafeErrorResponse` serializes to the client, HTTP 503) ever
contains a dollar figure or which specific dimension was exceeded — that detail lives in
`err.reasons`/`err.blockedScope`, which are only ever passed to `recordDiagnosticEngineRun`
(server-side observability) or `console.error`, never serialized into an API response.

## Cost observability (migration 0033 + 0035 additions to `diagnostic_engine_runs`)

Every turn attempt — completed, skipped, or failed, including one blocked by the kill switch or a
budget hard-stop — gets one row:

| Field | Meaning |
|---|---|
| `estimated_cost_usd_preflight` | The pre-call estimate ("reserved") that `guardCostCeiling`/the budget check actually evaluated |
| `estimated_cost_usd` | The post-call reconciled actual cost, from real token counts — null for a skipped or pre-call-blocked turn |
| `model_id` | Which model actually served the request (new — previously only `provider_id` was captured) |
| `cached_input_tokens` | Reserved for Anthropic prompt-cache read-token counts — currently always null (see the known limitation below) |
| `is_internal` | Whether `resolveDiagnosticEngineAccess` granted this call internal-tester status — a separate axis from `plan` |
| `blocked_budget_scope` | Which dimension (`global_daily`, `user_monthly`, etc.) caused a `budget_exceeded` failure — internal diagnosis only |

Global/user daily/monthly spend and cost-per-turn-status are not separate stored columns — they're
computed on demand via `sum(estimated_cost_usd) ... group by status` / `... where created_at >= X`
queries over this same table, matching how `ai-diagnostics/budget-guard.ts` already does it for
scan-report/chat.

**Known limitation carried over from Phase 2.1**: `cached_input_tokens` is always recorded `null`
today — `DiagnosticAIProviderResult` doesn't yet surface Anthropic's real
`cache_creation_input_tokens`/`cache_read_input_tokens` usage fields back to the caller, even
though the system prompt is already marked for caching (`AnthropicDiagnosticProvider.runDiagnosticEngineTurn`).
Extending that result type is a small, low-risk follow-up, not done in this pass.

## Privacy

No prompt text, VIN, complaint text, or technician note is ever captured by this module or the
table it reads from — see [PHASE_2_1_OBSERVABILITY.md](PHASE_2_1_OBSERVABILITY.md) for the full
privacy accounting, unchanged by this phase's additions (every new column here is a number, a
boolean, or a short fixed-vocabulary string, check-constrained at the database level).
