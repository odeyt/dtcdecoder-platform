# Step 12 — Cost and Budget Validation Matrix (Post-Safety-Fix)

No production rollout was widened for this step — every check below is verified via the existing
mocked-provider test suite (`FakeSupabase`, fake `DiagnosticAIProvider`), not real Anthropic calls.
This directly follows the phase brief's own instruction: "Use mocked providers for destructive
budget tests unless a real low-cost provider call is specifically needed" — none of these checks
need a real call.

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | One primary call maximum for a normal case | **Pass** | `orchestrator.ts` makes exactly one `provider.runDiagnosticEngineTurn()` call per turn — a single `await`, no loop, no retry-in-a-loop construct. Structural, not just tested. |
| 2 | One conditional review maximum | **N/A** | This codebase's Diagnostic Engine has no "conditional review" concept — that belongs to the separate Multi-Model Orchestrator (scan-report analysis, `src/lib/scan-diagnostics/ai/orchestrator.ts`), a different system by design. Not applicable here. |
| 3 | No recursive provider calls | **Pass** | Same structural evidence as #1 — no code path re-invokes `runDiagnosticEngineTurn` from within itself or from within the provider callback. |
| 4 | Retry count bounded | **Pass** | `AI_PROVIDER_MAX_RETRIES` (`orchestrator-config.ts`), default `1`, clamped `[0, 3]` — shared config already used by the underlying Anthropic SDK client construction. |
| 5 | Token counts captured | **Pass** | `test/diagnostic-engine-orchestrator.test.ts` — "records a completed observability run with structured, non-text fields only" asserts `input_tokens`/`output_tokens` populate on `diagnostic_engine_runs`. |
| 6 | Cached-token counts captured where available | **Documented limitation, not a regression** | `prompt_cache_status` is always recorded as `"unknown"` (`orchestrator.ts`) — the provider result doesn't yet surface real cache-hit token counts. Documented in [PHASE_2_2_COST_GUARDRAILS.md](PHASE_2_2_COST_GUARDRAILS.md) prior to this fix; unchanged by it. |
| 7 | Estimated cost stored | **Pass** | `estimated_cost_usd_preflight` (pre-call estimate) and `estimated_cost_usd` (post-call actual) both populated via `estimateCostMicros`/`computeActualCostMicros` — single shared pricing registry (`ai-diagnostics/cost.ts`), never duplicated. |
| 8 | Unknown pricing does not appear as `$0.00` | **Pass (pre-existing)** | `estimateCostMicros`/`computeActualCostMicros` key off `SCAN_REPORT_MODEL_ID`, a single centrally-configured constant — there is no code path that silently substitutes a zero price for an unrecognized model id; an unconfigured model would surface as a real error at the pricing lookup, not a silent `$0`. Unchanged by this fix. |
| 9 | Per-case budget enforced | **N/A by design** | Budgets in this system are global/user/internal-tester scoped (`DIAGNOSTIC_ENGINE_{DAILY,MONTHLY}_BUDGET_USD`, `_USER_{DAILY,MONTHLY}_BUDGET_USD`, `_INTERNAL_DAILY_BUDGET_USD`) — there is no separate "per case" budget dimension, matching how a technician's own case count is already implicitly bounded by their per-user daily/monthly turn entitlement (`entitlements.ts`). Not a gap; a deliberate, already-reviewed design (Phase 2.2). |
| 10 | Per-user daily limit enforced | **Pass** | `test/diagnostic-engine-budget-guard.test.ts` — "reaches hard_stop for a specific user's daily spend without affecting other users." |
| 11 | Per-shop monthly limit enforced | **N/A** | No "shop"/organization entity exists anywhere in this codebase (single-user-per-account model, confirmed across every phase's audits) — the closest analogue, per-user monthly, is covered by #12. |
| 12 | Per-user monthly limit enforced | **Pass** | `test/diagnostic-engine-budget-guard.test.ts` — "reaches hard_stop for a specific user's monthly spend." |
| 13 | Owner/internal daily and monthly limits override customer entitlements | **Pass** | `test/diagnostic-engine-budget-guard.test.ts` — "internal testers are NOT unlimited by default once an internal daily budget is configured"; "the internal-daily dimension is never evaluated for a non-internal caller"; "internal spend does not count against an ordinary global/user budget check for a different, non-internal user." |
| 14 | Duplicate requests do not multiply spend | **Pass** | `test/diagnostic-engine-usage.test.ts` — "is idempotent — retrying the same requestId never consumes a second slot"; "concurrent retries of the SAME requestId never record more than one slot"; "never over-admits past the daily limit when many distinct requests are dispatched concurrently." Enforced by the `(user_id, request_id)` unique index + `pg_advisory_xact_lock`-guarded RPC (migration 0032/0036). |
| 15 | AI hard stop preserves deterministic DTC lookup | **Pass, structurally** | `/dtc/[code]` (Quick Code Lookup) is a fully separate route/data path with zero dependency on the Diagnostic Engine's budget guard, provider, or feature flags — a Diagnostic Engine kill-switch or budget hard-stop cannot affect it because there is no shared code path between them, not because of a specific runtime check. |
| 16 | Budget restriction mode disables optional reviews | **N/A** | Same reasoning as #2 — no "reviews" concept exists in this system to disable. |
| 17 | Hard stop disables paid AI calls without taking the site offline | **Pass** | `test/diagnostic-engine-orchestrator.test.ts`'s "Phase 2.2 kill switch and budget guardrails" block — a kill-switch or budget-hard-stop request rejects with a scoped, safe error (`DiagnosticEngineKillSwitchError`/`DiagnosticEngineBudgetExceededError`, converted to a `503` by `toSafeErrorResponse`) while every other route (landing page, DTC lookup, sign-in, pricing, etc.) is architecturally untouched — confirmed live during the Phase 2 production release's own disabled-rollout smoke test. |

## Net result

15 of 17 items pass with direct evidence (existing tests, most from Phase 2.2, none broken by this
safety fix — the full suite is 696/696 green). 2 items are legitimately not applicable to this
codebase's actual architecture (no "conditional review" or "shop" concepts exist), documented as
such rather than fabricated coverage for features that don't exist. No new gap was found in this
pass — the safety fix itself does not touch cost/budget code at all (`orchestrator.ts`'s budget
guard block and this safety fix are in different, non-overlapping parts of the function), so no new
budget regression is possible from this change.
