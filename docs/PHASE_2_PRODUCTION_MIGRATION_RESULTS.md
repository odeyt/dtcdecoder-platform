# Phase 2 — Production Migration Results

Target: Supabase project `sysbwmiguyxwzufwxwpq` (confirmed production). Executed by the project
owner via the Supabase Dashboard SQL Editor, one migration file at a time, in numerical order,
per [PHASE_2_PRODUCTION_MIGRATION_RUNBOOK.md](PHASE_2_PRODUCTION_MIGRATION_RUNBOOK.md).

## Pre-migration baseline (Step 0, owner-run)

| Table | Row count |
|---|---|
| `scan_cases` | 4 |
| `ai_diagnostic_usage` | 5 |
| `analytics_events` | 40 |
| `ai_routing_decisions` | 0 |

## Per-migration execution result

| Migration | Result | Notes |
|---|---|---|
| `0030_phase1_analytics_events.sql` | **Success** | Ran clean first attempt |
| `0031_diagnostic_engine_core.sql` | **Success** | Ran clean first attempt — all 6 tables, 8 indexes, RLS, 6 policies |
| `0032_diagnostic_engine_entitlements.sql` | **Success** | Ran clean first attempt — table, 2 indexes, 2 functions, RLS, policy |
| `0033_diagnostic_engine_observability.sql` | **Success (2nd attempt)** | First paste was truncated by the SQL Editor clipboard/UI mid-statement (`drop policy if exists diag...`), producing a syntax error at end of input. No partial schema change resulted — Postgres never executed the truncated statement. Re-pasted the complete file in full on the second attempt; ran clean. This is exactly the scenario the idempotency work protects against, though in this case nothing had actually been applied yet to converge. |
| `0034_diagnostic_engine_hv_safety.sql` | **Success** | Ran clean first attempt |
| `0035_diagnostic_engine_budget_guardrails.sql` | **Success** | Ran clean first attempt |

## Post-migration verification (Step 3, owner-run against production)

- **Table existence** — all 8 new tables present: `diagnostic_answers`, `diagnostic_engine_runs`,
  `diagnostic_engine_usage`, `diagnostic_evidence`, `diagnostic_graph`, `diagnostic_probabilities`,
  `diagnostic_questions`, `repair_verifications`.
- **Row-count integrity** — re-checked after all 6 migrations: `scan_cases = 4`,
  `ai_diagnostic_usage = 5`, `analytics_events = 40`, `ai_routing_decisions = 0`. **Exact match to
  the pre-migration baseline** — zero rows lost or altered in any pre-existing table.
- **Constraint content** — both `analytics_events_event_type_check` and
  `diagnostic_evidence_evidence_type_check` exist with their widened definitions live (confirmed
  present; `diagnostic_evidence`'s constraint necessarily includes `hv_safety_hazard` since 0034
  itself reported success against the newly-created table).
- **RLS enabled** — `true` on all 8 new tables, no exceptions.
- **RLS policies** — exactly 8 policies, one `SELECT`-only owner-read policy per table, matching
  each migration file's own `CREATE POLICY` statement 1:1. No extra, missing, or overly broad
  policy exists.
- **RPC functions** — both `record_diagnostic_engine_usage` and `get_diagnostic_engine_usage_summary`
  exist.

## Conclusion

All six pending migrations (0030–0035) are now live in production. No pre-existing table, row, or
constraint was altered destructively. No release-blocking condition from the runbook was
triggered. Proceeding to Step 6 (real production RLS validation with actual accounts) before any
rollout-tier or feature-flag change.
