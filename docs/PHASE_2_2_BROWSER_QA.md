# Phase 2.2 — Browser and Device QA

## Result: live browser verification was not possible in this session

Attempted at the start of this step: `tabs_context` confirmed the Browser pane's tab inventory,
but `computer{action: "screenshot"}` failed with *"the Browser pane is not displayed, so the page
is not compositing frames."* This matches the identical finding from Phase 2.1
([PHASE_2_1_RELEASE_PLAN.md](PHASE_2_1_RELEASE_PLAN.md)'s "remaining limitations") — the
environment's Browser pane does not render frames in this session, independent of whether a dev
server is reachable. No screenshot, DOM read, or interaction was performed against the running
application. **Nothing below was executed and observed; it is a checklist for a human (or a
future session with a working Browser pane) to run against a real staging deployment, not a
report of completed testing.**

This is also consistent with `docs/PHASE_2_1_RELEASE_PLAN.md`'s explicit recommendation: *"a
manual smoke test before Stage 1 (open DTC Technician, click Guided Diagnosis, confirm the panel
renders...)"* — that manual step has still not been performed by anyone as of this phase.

## What full verification instead relied on

- `npx tsc --noEmit` — the new `GuidedDiagnosisPanel` HV-hazard rendering (Step 4) and all other
  UI-adjacent type surfaces compile cleanly.
- `npm run build` — the production build succeeds, including static generation for every locale.
- The full `vitest` suite (684 tests as of this phase) covers every piece of *logic* the UI
  depends on (turn response shape, safety classification, entitlement/budget error shapes) — but
  none of it exercises actual DOM rendering, since this codebase has no component-level test
  infrastructure (confirmed absent across every React component in Phase 0/1/2 — see
  `docs/PHASE_2_1_RELEASE_PLAN.md`'s "remaining limitations").

## Manual QA checklist (not yet executed — for staging activation)

### Anonymous user
- [ ] Landing page loads (desktop and mobile viewport).
- [ ] Public intake flow works end to end.
- [ ] No paid provider call occurs from browsing alone (verify via Network tab: no
      `/api/diagnostic-engine/v1/*` request fires without an explicit "Start Guided Diagnosis"
      click from a signed-in user).
- [ ] Sign-in handoff preserves intake content into the resulting case.
- [ ] No diagnostic credit is spent automatically on sign-in or case creation (per
      `docs/PHASE_2_1_RELEASE_PLAN.md` Step 6 — `POST /api/scan-diagnostics/cases` never triggers
      an AI call by itself).

### Free authenticated user
- [ ] Basic DTC lookup works, unaffected by any Diagnostic Engine flag state.
- [ ] "Start Guided Diagnosis" is reachable but a free user's turn is capped by the small
      daily/monthly allowance (`entitlements.ts`) — verify the locked/upgrade state renders once
      exhausted (`PanelStatus === "limit_reached"` in `GuidedDiagnosisPanel`), with the exact
      upgrade CTA and no raw budget figures shown.
- [ ] No provider call occurs once the free allowance is exhausted (Network tab: the `/turn`
      request still fires — entitlement checks happen server-side — but the response is a 429 with
      no `response`/`safety` payload).

### Internal tester (requires `DIAGNOSTIC_ENGINE_ROLLOUT_TIER=internal_only` + allowlisted email)
- [ ] Case creation works from the shell (no case yet → clicking Guided Diagnosis creates one via
      `POST /api/scan-diagnostics/cases`).
- [ ] Case resume works (reopening the shell with an existing `caseId` and clicking Guided
      Diagnosis again shows the same case's state, not a fresh one).
- [ ] Exactly one question renders at a time (`question` section only shows the current
      `nextQuestion`, never a list).
- [ ] Submitting an answer becomes evidence and the panel re-runs a turn automatically.
- [ ] Ranked hypotheses update after new evidence.
- [ ] A recommended test renders when `TEST_PLANNER_ENABLED`.
- [ ] The safety warning renders, including the new Phase 2.2 structured HV block (hazard,
      immediate action, prohibited actions, required qualification, PPE, manufacturer procedure)
      when a hazard is present — verify this with a case seeded with an HV-hazard-matching DTC.
- [ ] Repair verification checklist renders and checkboxes persist after toggling, once confidence
      reaches `high`.
- [ ] Refreshing the page and reopening Guided Diagnosis preserves the case's state (hypotheses,
      graph, safety) rather than restarting.
- [ ] Submitting the same answer twice (e.g. double-click) is blocked with a clear message, not a
      duplicate evidence row (`DuplicateAnswerError`, HTTP 409).
- [ ] A stale-graph-version response (simulate by triggering two turns for the same case in two
      browser tabs near-simultaneously) is handled without corrupting the case — the loser gets a
      409 and the case's evidence/graph remain whatever the winner committed.
- [ ] Simulating a provider failure (e.g. temporarily misconfigure the API key) shows the
      `guidedDiagnosisFailed` error state with a retry option, and the case's existing evidence is
      still visible/intact afterward.
- [ ] Simulating budget exhaustion (`DIAGNOSTIC_ENGINE_DAILY_BUDGET_USD=0.01`) shows the generic
      "temporarily unavailable" message, never a dollar figure or which budget dimension tripped.

### Accessibility
- [ ] Keyboard navigation reaches every interactive element in the shell and the Guided Diagnosis
      panel (composer, question response buttons/inputs, checklist checkboxes) without a mouse.
- [ ] Focus trap holds while the shell drawer/sheet is open (`Tab`/`Shift+Tab` never escape to the
      page behind it) — this logic already exists in `DtcTechnicianShell.tsx` and is unchanged by
      this phase; verify it still holds with the Guided Diagnosis panel's new content inside it.
- [ ] `Escape` closes the shell from any state, including mid-Guided-Diagnosis.
- [ ] Focus returns to the trigger button after closing.
- [ ] Screen-reader labels are present on the composer, answer inputs, and checklist checkboxes
      (already labeled via `sr-only`/`aria-*` attributes in the component — verify with a real
      screen reader, not just source inspection).
- [ ] The HV hazard block uses `role="alert"`/`aria-live="assertive"` (fixed during this phase —
      it previously only inherited the outer panel's `aria-live="polite"`, which waits for the user
      to be idle before announcing; an immediate_stop hazard warrants an assertive interrupt).
      Verify with a real screen reader that this actually interrupts and announces promptly.
- [ ] Mobile touch targets meet the existing 44px (`min-h-11`) minimum already used throughout the
      shell and panel.
- [ ] No horizontal overflow on mobile viewport widths (375px) with the new HV hazard block's
      longer text content.

## Screenshots

None captured — the Browser pane could not render frames, so no screenshot could be taken
regardless of sensitivity considerations.
