# Pricing/Entitlement Rollback Plan

Three independent things can be rolled back separately: the **application code** (git), the **database migration** (`0016`), and the **feature's effective behavior** (nothing to flag off here — unlike scan-diagnostics, this overhaul changes existing always-on features, not a new flagged one).

## Rolling back the application code

Standard git revert of the merge commit once this lands on `main`:

```bash
git revert <merge-commit-sha>
git push origin main
```

This restores the previous behavior: chat back to 5 free queries/day + token-budget-gated paid plans (reading `ai_usage`/`get_monthly_ai_tokens`), scan reports back to 2/25/100-per-month with no daily cap or free-tier redaction (reading `scan_usage`). **No database rollback is required** — the reverted code never references the new `ai_diagnostic_usage`/`ai_diagnostic_runs` tables, and the old tables/RPCs (`ai_usage`, `scan_usage`, `increment_ai_usage`, `get_monthly_ai_tokens`, `increment_ai_tokens`, `consume_scan_usage_slot`, `get_monthly_scan_usage`) were never touched by migration `0016` — they're still there, unused but fully intact, ready for the old code to read again immediately.

One thing to check after a code rollback: any usage recorded through the new `ai_diagnostic_usage` ledger while the new code was live is simply not read by the reverted code — a user who consumed some of their new daily/monthly allowance won't have that reflected in the old counters (which start counting fresh from whatever `ai_usage`/`scan_usage` already had). This is a one-time reconciliation gap, not a security or double-charge issue, and self-resolves at the next natural reset (next day for the query counter, next month for token/analysis counters).

## Rolling back the database migration (`0016`)

Only needed if you want the new tables gone entirely, not just unused — optional, since leaving them in place after a code-only rollback is harmless:

```sql
drop function if exists record_ai_diagnostic_usage(uuid, text, text, text, integer, integer);
drop function if exists get_ai_diagnostic_usage_summary(uuid);
drop table if exists ai_diagnostic_usage;
drop table if exists ai_diagnostic_runs;
```

This is destructive to any usage/cost data recorded under the new system specifically — it does not touch `ai_usage`, `scan_usage`, `scan_reports`, `subscriptions`, or anything else. Per this project's standing rule, **do not run this without explicit approval**, and confirm nothing else depends on these tables first (`grep -rn "ai_diagnostic_usage\|ai_diagnostic_runs" src/`).

## What triggers using this plan

- A production incident where the new shared ledger incorrectly blocks or under-blocks AI requests (e.g. the advisory-lock serialization has an unforeseen interaction with connection pooling, or a plan is resolving to the wrong access level).
- A decision to redesign the free-preview UX or report-count allowances further before they're proven out with real usage.
- Pricing-copy or entitlement-number errors discovered after deploy that are faster to fully revert than hotfix.

## What does NOT require rollback

- A single failed AI generation — already handled by the reserve/release pattern (`recordAiDiagnosticUsage`/`releaseAiDiagnosticUsage`); the slot is freed automatically, no manual intervention needed.
- A free user hitting their daily preview limit, or a paid user hitting their monthly/daily report limit — this is the intended, correct behavior, not a bug.
- Missing Creem checkout env vars (`docs/PAYMENT_PLAN_MAPPING.md`) — a pre-existing, separately-tracked blocker unrelated to this rollback plan.
