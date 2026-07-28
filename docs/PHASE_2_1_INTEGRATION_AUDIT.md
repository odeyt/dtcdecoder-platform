# Phase 2.1 — Integration Audit

Read-only audit performed before any Phase 2.1 code changes, per the phase brief's Step 1. Covers
migrations 0030/0031, RLS conventions, case ownership, entitlements, usage ledgers, feature
flags, the consultation shell, the `/api/diagnostic-engine/v1/*` routes, the AI provider
abstraction, and analytics/logging. Findings drive Steps 2–13; nothing below has been changed yet.

## 1. Reusable components (do not rebuild)

| Concern | Module | Reuse plan for 2.1 |
|---|---|---|
| Case ownership | `getCaseForOwner(userId, caseId)` (`scan-diagnostics/cases.ts`) — `.eq("id", caseId).eq("user_id", userId).maybeSingle()`, throws `ScanCaseNotFoundError` if absent | Already called at the top of `runDiagnosticEngineTurn` and all three `/api/diagnostic-engine/v1/*` routes. Keep as the single ownership check — do not add a second, parallel one. |
| Plan resolution | `getEffectivePlan(userId, email)` (`subscriptions.ts`) → `SubscriptionPlan = "free" \| "pro" \| "workshop"` | Reuse directly for entitlement gating (Step 4) — never re-derive plan from client input. |
| Entitlement registry | `AI_DIAGNOSTIC_ENTITLEMENTS` (`pricing.ts`) + `src/lib/ai-diagnostics/entitlements.ts` | Extend with new canonical feature keys (Step 4), don't fork a second registry. |
| Usage ledger | `ai_diagnostic_usage` / `recordAiDiagnosticUsage` / `releaseAiDiagnosticUsage` (`ai-diagnostics/usage.ts`), unique on `(user_id, request_id)` | The existing ledger is report-count-shaped (daily/monthly caps on whole "reports"), not turn-shaped. Step 4 adds a **parallel, turn-shaped** enforcement path rather than forcing a turn to consume a full report credit (see §4 gap below). |
| Cost/observability logging | `recordAiDiagnosticRun` (`ai-diagnostics/usage.ts`) → `ai_diagnostic_runs`, best-effort, never gates | Reuse the same table/shape for Diagnostic Engine turns (Step 8) instead of inventing a new cost-log table. |
| Admin auth | `requireAdmin()` / `isAllowedAdminEmail()` (`admin-auth.ts`), backed by `ADMIN_ALLOWED_EMAILS` env var | Reuse the same **pattern** (comma-separated email allowlist) for a new, separate `DIAGNOSTIC_ENGINE_ALLOWED_EMAILS` var — admin and "internal diagnostic tester" are different populations; do not conflate them. |
| Feature flags | `DIAGNOSTIC_ENGINE_FLAGS` (`diagnostic-engine/feature-flags.ts`), fresh `process.env` reads, all default off | Keep exactly as-is; Step 7 adds a rollout-tier flag on top, not a replacement. |
| AI provider abstraction | `DiagnosticAIProvider` / `registry.ts`, `runDiagnosticEngineTurn?()` optional method | No changes needed — already provider-neutral. |
| Consultation shell hook point | `DtcTechnicianShell.tsx`'s disabled "Guided Diagnosis" button + `DtcTechnicianContext` interface, explicitly documented as "Phase 2 scope" | This is the intended integration point (Step 5) — replace the disabled stub, not the whole shell. |
| Analytics | `recordEvent`/`ANALYTICS_EVENT_TYPES` (`analytics/events.ts`), backed by `analytics_events` (migration 0027, widened by 0030) | Reuse for funnel events (`guided_diagnosis_clicked` already exists); this is NOT the cost/usage ledger and must never gate anything. |

## 2. Migration review

**0030 (`0030_phase1_analytics_events.sql`)** — a single `alter table ... drop constraint /
add constraint` widening `analytics_events.event_type`'s check list from Phase 0's set to include
11 new Phase 1 funnel event names. No new table, no new column, no data touched. Trivial and
low-risk; safe to run standalone. Full analysis in
[PHASE_2_1_MIGRATION_RUNBOOK.md](PHASE_2_1_MIGRATION_RUNBOOK.md).

**0031 (`0031_diagnostic_engine_core.sql`)** — six new additive tables (`diagnostic_evidence`,
`diagnostic_graph`, `diagnostic_questions`, `diagnostic_answers`, `diagnostic_probabilities`,
`repair_verifications`), all `references scan_cases(id) on delete cascade`, all with owner-read
RLS. No existing table/column is touched. Full analysis in
[PHASE_2_1_MIGRATION_RUNBOOK.md](PHASE_2_1_MIGRATION_RUNBOOK.md).

Both are additive-only and independent of each other (0030 touches `analytics_events`, 0031 adds
new tables) — order between them doesn't matter functionally, but they're numbered and should run
in numeric order per this repo's existing convention.

## 3. RLS and ownership model — how it actually works here

This app's RLS convention (established since migration 0012) is **owner-read-only**: every
user-owned table gets exactly one policy, `for select using (auth.uid() = user_id)` or the
case-join equivalent. **There are no RLS `insert`/`update`/`delete` policies anywhere in this
codebase for any user-owned table.** All writes go through `createAdminClient()` (the
service-role key) from `server-only` modules — never through a user's own session. Under Postgres
RLS, a table with RLS enabled and only a `select` policy implicitly denies all other operations to
non-service-role callers; the service role bypasses RLS entirely by design.

**This means RLS is not what stops a user from writing to another user's case today — the
application code is.** RLS protects against a hypothetical future direct-client read (e.g., if a
page ever queried `diagnostic_evidence` via the browser Supabase client); it currently protects
against nothing on the write path, because there is no write path that isn't already
service-role. The real security boundary is: **every service-role write must be preceded by an
application-layer ownership check**, and that has to be verified function-by-function, not
assumed from the schema. See §3a for a concrete gap this audit found.

### 3a. Concrete finding: `recordAnswer` doesn't verify the question belongs to the case

`POST /api/diagnostic-engine/v1/cases/[caseId]/answers` calls `getCaseForOwner(user.id, caseId)`
— confirming the caller owns `caseId` — and then calls
`recordAnswer(questionId, caseId, answerText, answerValue)` (`question.ts`). But `recordAnswer`
inserts the `diagnostic_answers` row with the **caller-supplied `questionId`** and then runs:

```ts
await supabase.from("diagnostic_questions").update({ answered: true }).eq("id", questionId);
```

— filtered only by `id`, never by `case_id`. A user who owns case A and knows (or guesses) the
UUID of a `diagnostic_questions` row belonging to case B can submit an answer against their own
case A while `questionId` points at B's question. The insert succeeds (case A's ownership check
passed), and the update **marks another user's question as answered**, corrupting case B's state.
This is a real cross-user write, not just a theoretical one — `getCaseForOwner` verifies the
*case* in the URL, not the *question* in the body.

**Fix (Step 3):** `recordAnswer` must verify the question row's own `case_id` matches the passed
`caseId` before doing anything — either a `.eq("case_id", caseId)` filter added to both the
insert's implicit relationship and the update, or an explicit `getQuestionForCase` lookup that
throws a not-found error on mismatch. Covered by a new automated cross-user test in
[PHASE_2_1_RLS_SECURITY.md](PHASE_2_1_RLS_SECURITY.md).

No other Phase 2 write function accepts a client-supplied foreign id that isn't the route's own
verified `caseId` — `insertEvidence`, `recordQuestion`, `saveGraph`, `saveHypotheses` all key
strictly off the caller's own `caseId`, and `updateRepairVerificationItem` filters its update by
`case_id` directly. `recordAnswer` is the one exception found.

### 3b. No shop/org concept

Grepped for `shopId`/`shop_id`/shop membership — none exists anywhere in this codebase. This is a
single-user-per-account model throughout (Phase 0/1/2 alike). The brief's "shop-scoped records
must respect shop membership where applicable" has no applicable target today; noted so a future
multi-seat feature (Workshop plan's `technicianSeatLimit`, modeled as a number but never wired to
actual shared access — see the Phase "Entitlement" work) doesn't get silently assumed to already
work here.

## 4. Entitlement gap — the real headline finding

**`/api/diagnostic-engine/v1/cases/[caseId]/turn` performs zero entitlement/plan checks.** It
checks `PROBABILITY_ENGINE_ENABLED` (global kill switch) and `getCaseForOwner` (ownership) and
then calls the AI provider unconditionally for any signed-in owner of the case — free, paid, or
otherwise. This was a deliberate, documented deferral in Phase 2 (`orchestrator.ts`'s own header
comment: *"mapping [a turn] onto the existing per-report quota would... require a new pricing
decision this phase's spec doesn't make"*) — but Phase 2.1's brief explicitly requires closing
this before any staged enablement. Since every flag defaults off, this has had zero real-world
exposure so far; it becomes exploitable the moment `PROBABILITY_ENGINE_ENABLED=true` in any shared
environment.

Design for Step 4: new canonical feature keys (`diagnostic_engine_turn`, `guided_diagnosis`,
`repair_verification`, `advanced_test_planner`) in a single registry, each independently gateable
by plan, checked once per route (not duplicated per-route), atomically recorded via a new
turn-shaped usage ledger (parallel to, not reusing, the report-shaped one — a turn is roughly
"one small Anthropic call," not "one full report").

## 5. UI integration gaps

- `DtcTechnicianShell.tsx`'s "Guided Diagnosis" button is `disabled`, `title="guidedDiagnosisComingSoon"` — the intended, already-anticipated hook point (per its own header comment referencing Phase 2). No code currently calls `/api/diagnostic-engine/v1/*` from any UI.
- `DtcTechnicianContext` (`dtc-technician/context.ts`) already carries `caseId`/vehicle/DTCs/symptoms/`workflowState` — designed for exactly this wiring, unused for it today.
- No component exists yet to render a structured turn response (ranked hypotheses, confidence band, next question, safety classification, recommended test, repair-verification checklist). `LockedResultCard` (entitlement redaction UI) is the closest existing precedent for a "structured, non-paragraph" AI result card.
- "Save to Case" is also a disabled stub in the same shell — relevant to Step 6 (case creation/save flow).

## 6. Observability gaps

- The Diagnostic Engine orchestrator calls the AI provider with **no request id, no latency capture, no cost recording, no failure-category classification** — `recordAiDiagnosticRun` (the established pattern) is never called from `orchestrator.ts` today.
- `costOptimization.aiCallSkipped` exists in the turn result but is never logged/persisted anywhere — a skip is currently invisible outside the single API response.
- No structured field exists yet for "provider selected" / "prompt-cache status" per turn.

## 7. Conflicts with Phase 0/1/2 behavior

None found that would break existing behavior — Phase 2 was built additively and all flags
default off. The one substantive risk is the entitlement gap in §4: if Phase 2.1 wires the shell
to call `/turn` without first closing that gap, a signed-in free user would get unlimited
provider-backed diagnostic turns, which is inconsistent with every other AI-calling feature in
this app (chat, scan report) and must not ship that way even to an internal allowlist.

## 8. Summary of required changes (mapped to remaining steps)

1. Fix `recordAnswer` cross-case write (Step 3).
2. Add entitlement gate + turn-shaped usage ledger to all three Diagnostic Engine routes (Step 4).
3. Wire shell's Guided Diagnosis button to the real pipeline, with a structured result renderer, behind flags (Step 5).
4. Add a real case-creation/resume/save flow that never force-spends a provider call (Step 6).
5. Add an internal-allowlist rollout tier on top of the existing all-off flags (Step 7).
6. Wire `recordAiDiagnosticRun`-equivalent observability into the orchestrator, with redaction (Step 8).
7. Add explicit failure-path handling for the listed failure modes (Step 9).
8. Build the fixture-based validation harness (Step 10).
9. Add the listed test coverage (Step 11), verify browser behavior where possible (Step 12), and finish documentation (Step 13).
