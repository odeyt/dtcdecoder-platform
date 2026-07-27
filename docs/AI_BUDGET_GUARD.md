# AI Budget Guard

The multi-model orchestrator's owner-level, aggregate spend control — distinct from (and
layered on top of) the pre-existing per-request cost ceiling
(`src/lib/ai-diagnostics/cost.ts` `guardCostCeiling`, `COST_GUARDS.hardCeilingUsd`). See
`docs/MULTI_MODEL_ORCHESTRATOR.md` for how this fits into the full request sequence.

## What it checks

`computeBudgetState(userId)` (`src/lib/ai-diagnostics/budget-guard.ts`) sums
`ai_diagnostic_runs.estimated_total_cost_micros` (the pre-existing cost ledger — migrations
0016/0023; no new table needed for this) over four independent windows:

1. **Owner daily** — every user, since UTC midnight (`AI_DAILY_BUDGET_USD`).
2. **Owner monthly** — every user, since the 1st of the UTC month (`AI_MONTHLY_BUDGET_USD`).
3. **Per-user daily** — just the requesting user, since UTC midnight (`AI_PER_USER_DAILY_BUDGET_USD`).
4. **Per-shop monthly** — no shop entity exists in this schema, so this is evaluated as an
   alias of the requesting user's own monthly spend (`AI_PER_SHOP_MONTHLY_BUDGET_USD`).

Any dimension left unset in `.env` is skipped entirely — never treated as an implicit $0
ceiling (an unset budget means "no aggregate limit on this axis," not "always over budget").

The worst (most restrictive) state across all four configured dimensions wins.

## States

| State | Threshold (of whichever dimensions are configured) | Behavior |
|---|---|---|
| `normal` | < `AI_BUDGET_WARNING_PERCENT` (default 75%) | No change. |
| `warning` | 75-89% | Quality-audit sampling is halved (see below) — the only behavioral change at this state. |
| `restrict` | 90-99% | Optional (non-safety-critical, non-premium) Anthropic reviews are suppressed — the router still runs and logs what it WOULD have escalated to, but no second call happens. Safety-critical and premium-consensus cases are never suppressed. |
| `hard_stop` | ≥ `AI_BUDGET_HARD_STOP_PERCENT` (default 100%) | `assertBudgetAllowsGeneration` throws `BudgetHardStopError` **before the primary provider is ever called** — the case fails with a "temporarily paused" message, its usage reservation is released (never counted against the plan's report allowance), and deterministic DTC lookup remains fully available elsewhere in the app. The site is never taken offline. |

## Owner budget overrides plan entitlements

A configured budget can restrict or hard-stop generation for **every** plan, including
Workshop — this is deliberate. Plan/entitlement checks (`ai_diagnostic_usage`,
`src/lib/ai-diagnostics/usage.ts`) answer "is this user allowed to generate a report at
all"; the budget guard answers "can the SITE OWNER afford this generation right now,"
and the second question is checked independently, after the first.

## Quality-audit reduction at "warning"

`runOrchestratedDiagnosis` halves `AI_QUALITY_AUDIT_PERCENT` for the router's random-sampling
check when the budget state is `warning` — e.g. a configured 5% rate becomes 2.5%. This is
the ONLY behavior change at `warning`; it exists purely to trim non-essential spend before
`restrict` kicks in. Safety-critical and human-review escalation are never reduced by
budget pressure at any state short of the primary call itself being blocked at `hard_stop`.

## Fresh reads, no caching

Every threshold and limit in `src/lib/ai-diagnostics/orchestrator-config.ts` is read from
`process.env` on each call (functions, not module-level constants evaluated once at import).
A budget guard that could serve a stale "normal" reading past the real hard-stop moment would
defeat the point of having one; the read itself is a few cheap indexed aggregate queries
against `ai_diagnostic_runs_created_cost_idx` (migration 0023), not a meaningful latency cost
relative to the AI call it's gating.

## Testing

`test/ai-orchestrator-budget-guard.test.ts` covers: no-configured-dimension → always
`normal` regardless of real spend; warning/restrict/hard_stop transitions at the documented
percentages; owner-wide budgets counting spend across multiple users; the per-shop-as-alias-
of-per-user behavior; and that `assertBudgetAllowsGeneration` throws only at `hard_stop`.
