# Phase 2.1 — Release Plan

Ties together [PHASE_2_1_INTEGRATION_AUDIT.md](PHASE_2_1_INTEGRATION_AUDIT.md),
[PHASE_2_1_MIGRATION_RUNBOOK.md](PHASE_2_1_MIGRATION_RUNBOOK.md),
[PHASE_2_1_RLS_SECURITY.md](PHASE_2_1_RLS_SECURITY.md),
[PHASE_2_1_OBSERVABILITY.md](PHASE_2_1_OBSERVABILITY.md), and
[DIAGNOSTIC_ENGINE_VALIDATION.md](DIAGNOSTIC_ENGINE_VALIDATION.md) into one rollout procedure.
**Nothing in this phase has been enabled anywhere, migrated anywhere, or deployed anywhere** —
every flag stays at its default (off), and this plan exists to make turning it on, in careful
stages, safe when the project owner chooses to.

## What Phase 2.1 added on top of Phase 2

| Area | What changed |
|---|---|
| Security | Fixed a real cross-case write in `recordAnswer` (a case's question could be answered/corrupted from a different case the caller doesn't own) — see RLS doc. Added route-level cross-user/unauthenticated tests. |
| Entitlements | New `diagnostic_engine_usage` ledger + registry (`entitlements.ts`/`usage.ts`), independent of the existing report-shaped ledger, with free/pro/workshop tiers and an internal-tester allowlist. |
| Rollout control | `DIAGNOSTIC_ENGINE_ROLLOUT_TIER` (`disabled` / `internal_only` / `allowlist_only` / `all_paid_users`) layered on top of the existing per-module flags — `/turn` is unreachable for anyone until this is explicitly set. |
| UI | `GuidedDiagnosisPanel` wired into `DtcTechnicianShell`'s previously-disabled "Guided Diagnosis" button — renders the structured turn response (summary, evidence used, ranked hypotheses, confidence, missing evidence, recommended tests, safety classification, one next question, repair-verification checklist), one question at a time. |
| Observability | `diagnostic_engine_runs` (migration 0033) — every turn attempt (completed/skipped/failed) recorded with structured, non-free-text metadata; cost reuses the existing `ai-diagnostics/cost.ts` estimator. |
| Reliability | Fixed two real gaps the phase brief specifically called out: stale graph version (now detected via optimistic concurrency, `StaleGraphVersionError`) and duplicate answer submission (now a clean `DuplicateAnswerError` instead of a raw constraint violation). |
| Validation | A 10-category fixture harness (`diagnostic-engine/validation/`) runs automatically in the test suite and surfaced a real, documented safety-classification gap (see the validation doc). |

## Canonical feature keys

`src/lib/diagnostic-engine/entitlements.ts` exports `DiagnosticEngineFeatureKey`:
`diagnostic_engine_turn`, `guided_diagnosis`, `repair_verification`, `advanced_test_planner`.
UI and route code should check `hasFeatureAccess(plan, key)` — never a plan-name string
comparison scattered across files.

## Rollout stages

Set these env vars in order, verifying at each stage before advancing. All are read fresh per
request (no restart-required caching), but changing them in a shared environment still affects
every request immediately — treat each stage change like a real deploy.

**Stage 0 — current state.** `DIAGNOSTIC_ENGINE_ROLLOUT_TIER` unset (`disabled`). All six
per-module flags unset. `/api/diagnostic-engine/v1/*` 404s for everyone. This is safe to leave
indefinitely.

**Stage 1 — internal-only, migrations applied.**
1. Apply migrations `0030`, `0031`, `0032`, `0033` per the migration runbook, in a **non-production**
   or explicitly-confirmed environment.
2. Set `ADMIN_ALLOWED_EMAILS` to include whoever will test this (reused from the existing admin
   allowlist — see the RLS doc for why `internal_only` uses this list specifically, not a new one).
3. Set `DIAGNOSTIC_ENGINE_ROLLOUT_TIER=internal_only`.
4. Set `DIAGNOSTIC_GRAPH_ENABLED=true`, `QUESTION_ENGINE_ENABLED=true`, `PROBABILITY_ENGINE_ENABLED=true`,
   `CONFIDENCE_ENGINE_ENABLED=true`. Leave `TEST_PLANNER_ENABLED`/`REPAIR_VERIFICATION_ENABLED` off
   initially to keep the first real run small.
5. As an admin-allowlisted user, open DTC Technician, click "Start Guided Diagnosis" on a real
   test case, and manually walk through the checklist in
   [DIAGNOSTIC_ENGINE_VALIDATION.md](DIAGNOSTIC_ENGINE_VALIDATION.md)'s manual procedure.
6. Check `diagnostic_engine_runs` for the recorded turn (status, cost, latency) and
   `diagnostic_engine_usage` for the consumed slot.

**Stage 2 — broader internal allowlist.**
1. Add specific tester emails to `DIAGNOSTIC_ENGINE_ALLOWED_EMAILS` (separate from
   `ADMIN_ALLOWED_EMAILS` — these are testers, not necessarily admins).
2. Set `DIAGNOSTIC_ENGINE_ROLLOUT_TIER=allowlist_only`.
3. Enable `TEST_PLANNER_ENABLED` and `REPAIR_VERIFICATION_ENABLED` once Stage 1 has run cleanly for
   a few real cases.
4. Watch `diagnostic_engine_runs` for `failure_category` distribution and
   `costOptimization.aiCallSkipped` rate.

**Stage 3 — all paid users.**
1. Set `DIAGNOSTIC_ENGINE_ROLLOUT_TIER=all_paid_users`. Free-tier users still get the
   entitlement-limited "locked preview" experience (small daily/monthly turn allowance, then an
   upgrade prompt) — this tier does not bypass `entitlements.ts`.
2. Monitor cost via `diagnostic_engine_runs.estimated_cost_usd` and the existing per-request cost
   ceiling (`guardCostCeiling`) — no separate aggregate budget guard exists for the Diagnostic
   Engine yet (the Multi-Model Orchestrator's `budget-guard.ts` covers scan-report/chat only); add
   one before this stage if sustained volume is expected.

**Never**: skip a stage, apply migrations to a shared/production database without independent
confirmation of which project is targeted (see the migration runbook's warning), or merge/deploy
without separate explicit authorization — none of that is done or requested in this phase.

## Remaining limitations (honest, not deferred silently)

- **No live browser verification was possible in this session** — the environment's Browser pane
  could not reach a running dev server (see Step 12 in the audit trail). `tsc`, `npm run build`,
  and the full `vitest` suite all pass, and the new UI component was manually reviewed, but its
  actual rendered behavior in a browser has not been observed. Recommend a manual smoke test
  before Stage 1 (open DTC Technician, click Guided Diagnosis, confirm the panel renders without
  a real backend call by checking the network tab for the expected 404 with all flags off).
- **Prompt-cache status is always `"unknown"`** in observability — `DiagnosticAIProviderResult`
  doesn't yet surface Anthropic's real cache hit/miss token counts (see the observability doc).
- **EV/high-voltage safety classification is not yet deterministic from evidence alone** — it
  currently requires the AI's own `safetyWarnings` text to reach `immediate_stop` (see the
  validation doc's confirmed finding). Recommended as a priority follow-up before relying on this
  feature for genuinely high-voltage cases at scale.
- **No aggregate cost/budget guard** for the Diagnostic Engine specifically (only the existing
  per-request cost ceiling) — the Multi-Model Orchestrator's aggregate daily/monthly/per-user
  budget guard was built for scan-report/chat and hasn't been extended to cover Diagnostic Engine
  turns.
- **"Save to Diagnostic Case" (saving a chat transcript) remains a disabled stub** in the shell —
  out of scope for this phase, since Guided Diagnosis mode already auto-persists all of its state
  (evidence/graph/questions/hypotheses) server-side per turn; there's no equivalent transcript to
  "save" for that mode. Only the older free-text chat mode's transcript-saving remains
  unimplemented, unchanged from Phase 1.
- **No React component-level tests** for `GuidedDiagnosisPanel` — this matches the established
  convention in this codebase (zero components anywhere have rendering tests; the test suite is
  backend/route/logic-focused throughout Phase 0/1/2), not a gap introduced by this phase.
