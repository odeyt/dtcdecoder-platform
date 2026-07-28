# Phase 2.2 — Release Readiness

This is the sixth and final Phase 2.2 doc. It ties together the release gates (Step 13), the
internal staging configuration (Step 10), and pointers to every other Phase 2.2 deliverable.

## Release gates

### Safety gate — PASS

- The core Phase 2.2 defect (real HV/EV faults never produced `safety_issue` evidence because
  `SAFETY_SYSTEM_PATTERN` had no HV vocabulary — see
  [PHASE_2_2_EV_SAFETY_AUDIT.md](PHASE_2_2_EV_SAFETY_AUDIT.md)) is fixed with a deterministic,
  evidence-derived `hv_safety_hazard` type and a severity-precedence combinator
  (`classifyDriveSafety` in `src/lib/diagnostic-engine/safety.ts`) — AI-generated text can raise
  the classification but never lower it below the evidence floor.
- Categorical confidence only — no numerical probabilities anywhere in the safety or diagnostic
  output (unchanged invariant from Phase 2/2.1, re-verified this phase:
  `expect(classifyDriveSafety.length).toBe(2)` proves the function signature has no confidence
  input at all — safety and diagnostic confidence are structurally independent).
- 12 new HV/EV fixtures (9 genuine hazards, 3 deliberate non-hazards) all pass automated
  evidence-only classification — see `test/diagnostic-engine-hv-validation-harness.test.ts` and
  [PHASE_2_2_INTERNAL_ACCEPTANCE.md](PHASE_2_2_INTERNAL_ACCEPTANCE.md).
- Never renders detailed HV disassembly instructions — `buildHvHazardDetail` in `safety.ts` only
  ever emits category/immediate-action/prohibited-actions/qualification/PPE/manufacturer-procedure
  fields, never step-by-step teardown text.

### Security gate — PASS (with one pre-existing, documented limitation)

- Ownership checks remain the real write-side boundary (RLS is owner-read-only everywhere; writes
  go through the service-role client gated by application-layer `getCaseForOwner` checks) — see
  [PHASE_2_1_RLS_SECURITY.md](PHASE_2_1_RLS_SECURITY.md), unchanged this phase.
- Budget-exhaustion errors never leak dollar figures or which dimension tripped —
  `BUDGET_EXHAUSTED_USER_MESSAGE` is a fixed generic string;
  `test/diagnostic-engine-budget-guard.test.ts` explicitly asserts the thrown error's `.message`
  never contains a `$` figure.
- Internal-tester spend is isolated per-user and never leaks into another user's budget check
  (tested).
- **Known limitation, unchanged from Phase 2.1**: this codebase's Supabase mock (`FakeSupabase`)
  cannot exercise real Postgres RLS or true multi-connection concurrency. The concurrent-
  reservation tests added this phase (`test/diagnostic-engine-usage.test.ts`) prove the
  *application-layer* logic serializes correctly against the fake's synchronous in-memory model;
  they do not prove the real `pg_advisory_xact_lock`-guarded RPC behaves identically under real
  concurrent Postgres connections. That can only be verified against a real staging database.

### Cost gate — PASS

- Aggregate budget guardrails exist for the first time for the Diagnostic Engine (global daily/
  monthly, per-user daily/monthly, internal-tester daily, provider kill switch) — see
  [PHASE_2_2_COST_GUARDRAILS.md](PHASE_2_2_COST_GUARDRAILS.md).
- Single pricing registry (`src/lib/ai-diagnostics/cost.ts`) remains the only place cost is
  computed; the new budget guard only sums already-computed figures.
- Budget check runs after the pre-flight cost-ceiling guard but before the usage-ledger
  reservation, so a blocked request never consumes a turn-count slot (verified by test).
- All 6 budget env vars default to unset/unlimited — a fresh environment has no budget enforcement
  until explicitly configured, consistent with every other Phase 2.2 flag defaulting off.

### Product gate — PARTIAL (blocked on live browser/device access, documented not fabricated)

- Structured, one-question-at-a-time rendering with the new HV hazard block exists in
  `GuidedDiagnosisPanel.tsx`, including this phase's `role="alert"`/`aria-live="assertive"`
  accessibility fix for the hazard block specifically.
- Live browser verification was **not possible** in this session (Browser pane does not composite
  frames here) — see [PHASE_2_2_BROWSER_QA.md](PHASE_2_2_BROWSER_QA.md) for the full, honest
  account and the unexecuted manual checklist that must be run by a human (or a session with a
  working Browser pane) before wider rollout.
- No real shop diagnostic data exists in this environment; internal acceptance validation used the
  same synthetic fixtures already built for the automated harness, clearly labeled as such — see
  [PHASE_2_2_INTERNAL_ACCEPTANCE.md](PHASE_2_2_INTERNAL_ACCEPTANCE.md).

### Quality gate — PASS

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- `npx vitest run` — 686/686 passing (76 test files).
- `npm run build` — production build succeeds, including static generation for every locale.

## Internal staging configuration (Step 10)

Recommended environment for the **first** activation (internal testers only, not paid users):

```
DIAGNOSTIC_ENGINE_ROLLOUT_TIER=internal_only
DIAGNOSTIC_ENGINE_ALLOWED_EMAILS=<comma-separated tester emails, optional — internal_only already
                                   gates on ADMIN_ALLOWED_EMAILS; only set this too if you want a
                                   broader/different tester population than admins>

# Minimum per-module flags needed to exercise the full guided-diagnosis path.
# Every flag below defaults to unset/false — nothing here is implied by the
# rollout tier alone.
DIAGNOSTIC_GRAPH_ENABLED=true
QUESTION_ENGINE_ENABLED=true
PROBABILITY_ENGINE_ENABLED=true
CONFIDENCE_ENGINE_ENABLED=true
REPAIR_VERIFICATION_ENABLED=true
TEST_PLANNER_ENABLED=true

# Budget guardrails — set conservative real limits before any internal
# testing begins, so a testing session cannot run up unbounded provider
# spend. Figures below are a starting suggestion, not a mandate — the repo
# owner should set real numbers appropriate to their provider account.
DIAGNOSTIC_ENGINE_DAILY_BUDGET_USD=5
DIAGNOSTIC_ENGINE_MONTHLY_BUDGET_USD=50
DIAGNOSTIC_ENGINE_INTERNAL_DAILY_BUDGET_USD=5
DIAGNOSTIC_ENGINE_PROVIDER_KILL_SWITCH=false
```

`DIAGNOSTIC_ENGINE_USER_DAILY_BUDGET_USD` / `DIAGNOSTIC_ENGINE_USER_MONTHLY_BUDGET_USD` can stay
unset at this stage — the internal-tester population is the global population during
`internal_only`, so the global and internal budgets already bound total spend; per-user limits
become more relevant once `allowlist_only`/`all_paid_users` is considered later.

`isDiagnosticEngineRolloutAllowed` (`src/lib/diagnostic-engine/feature-flags.ts`) is the single
gate every route checks first — with the tier above, only accounts in `ADMIN_ALLOWED_EMAILS` can
reach the Diagnostic Engine at all, independent of the per-turn entitlement limits in
`entitlements.ts`, which still apply on top for whoever is admitted.

This configuration must be applied to a **staging** environment only. No production environment
variable should be changed as part of this phase without separate, explicit authorization — none
was given.

## Migrations required before staging activation

Six migrations, in order: `0032` through `0035` are new this phase-pair (`0032`/`0033` from Phase
2.1, `0034`/`0035` from Phase 2.2) plus the pre-existing `0030`/`0031` context. Full preflight SQL,
per-object verification queries, cross-user RLS security checks, and rollback SQL are in
[PHASE_2_2_STAGING_MIGRATION_RUNBOOK.md](PHASE_2_2_STAGING_MIGRATION_RUNBOOK.md). **None of these
have been applied to any database in this session** — they are reviewed and staged for manual
application only.

## Manual steps required before internal staging activation

1. Review and apply migrations `0032`–`0035` to the staging Supabase project using the runbook's
   preflight/verify/rollback procedure (not production).
2. Set the staging environment variables listed above in the internal staging configuration
   section.
3. Run the unexecuted manual browser/device QA checklist in
   [PHASE_2_2_BROWSER_QA.md](PHASE_2_2_BROWSER_QA.md) against the real staging deployment —
   anonymous, free, internal-tester, and accessibility scenarios, including a real screen-reader
   check of the new `aria-live="assertive"` HV hazard block.
4. Confirm real provider credentials exist in the staging environment (Anthropic API key at
   minimum) and manually exercise one real Guided Diagnosis turn end-to-end, including a
   deliberately HV-hazard-matching case, to confirm the deterministic safety floor holds against a
   real (not mocked) provider response.
5. Confirm budget figures in step 2 are real, intentional numbers the repo owner is comfortable
   spending, not placeholders.
6. Only after 1–5 are done and reviewed: flip `DIAGNOSTIC_ENGINE_ROLLOUT_TIER` to `internal_only`
   in the staging environment (already suggested above) and begin internal testing.

Widening beyond `internal_only` (to `allowlist_only` or `all_paid_users`), merging this branch,
deploying, or applying any migration to production all require separate, explicit authorization —
none of that is part of this phase and none of it was done.

## Remaining limitations (carried forward honestly, not fixed this phase)

- Live browser/device verification was not possible in this session (environment limitation, not
  skipped work) — see [PHASE_2_2_BROWSER_QA.md](PHASE_2_2_BROWSER_QA.md).
- No real shop ticket data was available to validate against — synthetic fixtures were used and
  clearly labeled — see [PHASE_2_2_INTERNAL_ACCEPTANCE.md](PHASE_2_2_INTERNAL_ACCEPTANCE.md).
- `cached_input_tokens` observability remains always-null — the AI provider abstraction doesn't yet
  surface real prompt-cache token counts (documented in
  [PHASE_2_2_COST_GUARDRAILS.md](PHASE_2_2_COST_GUARDRAILS.md), not a regression this phase).
- True atomic-at-the-database-row-lock budget reservation is not implemented — the aggregate
  budget guard reads-then-decides on every call (matching the pre-existing tolerance already
  accepted in `ai-diagnostics/budget-guard.ts`, not a new gap introduced this phase).
- FakeSupabase-based tests cannot prove real Postgres RLS or true concurrent-connection behavior —
  see the security gate section above.
- "Save to Diagnostic Case" (chat transcript saving) remains an unimplemented Phase 1 stub,
  unchanged and out of scope for Phase 2.2.
