# Phase 2.2 — Internal Acceptance (Real-Case-Pattern Validation)

## Data provenance — read this first

This environment has no access to actual shop diagnostic tickets, and none should be fabricated
or claimed as real. Every case below is a **synthetic, generic scenario representative of a real
diagnostic pattern** (the same fixtures already built for the automated validation harness —
`src/lib/diagnostic-engine/validation/fixtures.ts` and `hv-fixtures.ts`), not sourced from any
actual customer record. This satisfies the phase brief's own constraint — *"Do not train or
permanently store customer-identifying data"* — the strongest way to guarantee that is to never
have any customer data in the loop at all. If real, anonymized shop tickets become available
later, they should replace these fixtures directly (same `ValidationFixture` shape), and this
document should be regenerated from real data at that point — clearly labeled as such when it
happens.

## What was actually run vs. what requires a real provider call

The **Question Engine** and **Safety Engine** results below are real, deterministic, automated
output — every row was produced by actually calling `selectNextQuestion`/`classifyDriveSafety`
against the fixture's evidence (the same calls `test/diagnostic-engine-validation-harness.test.ts`
and `test/diagnostic-engine-hv-validation-harness.test.ts` assert on, currently 100% passing). The
**hypothesis ranking** and **suggested next test** columns reflect what the AI *should* produce
given the evidence (per the fixture's own `expectedUsefulTests`/`knownConfirmedRootCause` design
intent) — actually exercising those requires a real Anthropic call, which is not run automatically
(costs real tokens, requires live credentials) — see
[DIAGNOSTIC_ENGINE_VALIDATION.md](DIAGNOSTIC_ENGINE_VALIDATION.md)'s manual procedure for how to
complete that column for real once staging is active.

## Required case set (10 categories, all present)

| Category | Initial complaint | Evidence entered | First question (actual) | Safety result (actual) |
|---|---|---|---|---|
| No crank | Engine does not crank at all | complaint, DTC P0562 (System Voltage Low, current) | `symptom_onset` | `safe_to_drive` (no HV/safety-issue evidence) |
| Crank but no start | Cranks normally, won't start | complaint, DTC P0335 (Crankshaft Position Sensor Circuit, current) | `symptom_onset` | `safe_to_drive` (evidence-only floor; AI text would typically raise this to `tow_recommended` for a genuine no-start) |
| Misfire | Rough idle, intermittent shaking | complaint, symptom, DTC P0301 (current) | `symptom_onset` | `safe_to_drive` (evidence-only floor) |
| CAN fault | Multiple warning lights, intermittent gauge loss | complaint, DTC U0100 (current), safety_issue | `symptom_onset` | `drive_with_caution` |
| Low-voltage multi-module fault | Multiple modules faulting, worse in cold | complaint, DTC P0562 + U0100 | `symptom_onset` | `safe_to_drive` (evidence-only floor) |
| Sensor circuit fault | Check engine light, no drivability change | complaint, DTC P0171 (current) | `symptom_onset` | `safe_to_drive` |
| Mechanical fault causing electrical symptoms | CEL with timing code after belt service | complaint, DTC P0016 (current), previous_repair | `symptom_onset` | `safe_to_drive` (evidence-only floor) |
| Incorrectly replaced part | Same CEL returned after gas cap replacement | complaint, DTC P0455 (current), previous_repair | `symptom_onset` | `safe_to_drive` |
| Intermittent harness fault | Random warning lights, worse over bumps | complaint, DTC P0700 (pending) | `symptom_onset` | `safe_to_drive` (evidence-only floor) |
| EV charging/HV case | HV warning, won't enter Ready mode | complaint, DTC P0AA6 "Hybrid/EV Battery Isolation Fault" (current) → derives `hv_safety_hazard` | `symptom_onset` | **`immediate_stop`** (deterministic, evidence alone — the Phase 2.2 fix) |

`symptom_onset` ("When does this happen — cold start, under load, at idle, or all the time?") is
the actual Question Engine pick for every fixture here — it's the lowest-tier candidate with no
skip condition once `complaint` evidence exists (every fixture has complaint evidence, so the
tier-1 `complaint` question is always skipped), and no fixture's evidence includes a prior answer
to it. This is real, verified, automated output, not a projection — each fixture's
`expectedHighValueQuestionFieldKeys` includes `symptom_onset` for exactly this reason (see
`test/diagnostic-engine-validation-harness.test.ts`, currently 100% passing). A second engine
turn (after `symptom_onset` is answered) would move on to the fixture's other listed candidate
(e.g. `crank_status`/`dtc_status`/`previous_repair`, depending on category) — not exercised here
since that requires a second real turn, not just a first-question check.

`knownConfirmedRootCause` (fixture design intent, for human reference — never asserted against by
the automated harness, per the phase brief: *"do not assert that the system must identify one
exact root cause from insufficient evidence"*):

- No crank → corroded battery ground strap.
- Crank/no-start → open circuit at the crank position sensor connector.
- Misfire → fouled plug on cylinder 1 from a failing coil.
- CAN fault → damaged CAN bus wiring.
- Low-voltage multi-module → corroded chassis ground point.
- Sensor circuit fault → vacuum leak at the intake manifold gasket.
- Mechanical/electrical → timing belt installed one tooth off during recent service.
- Incorrectly replaced part → the real leak was a cracked EVAP purge line, not the gas cap.
- Intermittent harness → chafed harness section near a suspension mount.
- EV/HV → high-voltage isolation fault requiring qualified EV service before further diagnosis.

## EV/HV fixture set (12 categories, Phase 2.2 — see `hv-fixtures.ts`)

All 9 genuine active-hazard categories (isolation fault, battery overtemperature, orange cable
damage, charging-port overheating, contactor fault, HV interlock fault, collision-damaged
battery, water intrusion, battery smoke/odor) reach `immediate_stop` from evidence alone — verified
automated result, not projected. The 3 non-hazard categories (low-voltage fault on a conventional
vehicle, a generic communication fault, a historical/inactive HV code) stay at `safe_to_drive` or
`drive_with_caution`, never escalating past that — also a verified automated result, proving the
engine doesn't over-trigger on every EV-adjacent code. Full detail in
[PHASE_2_2_EV_SAFETY_AUDIT.md](PHASE_2_2_EV_SAFETY_AUDIT.md) and
[DIAGNOSTIC_ENGINE_VALIDATION.md](DIAGNOSTIC_ENGINE_VALIDATION.md).

## Qualitative assessment (per the phase brief's own checklist)

- **Avoids parts roulette**: every fixture's `unacceptableRecommendations` list (e.g. "Replace
  starter motor" for the no-crank case, "Replace ECM without testing the network first" for the
  CAN fault case) is checked by `evaluatePartsRouletteAbsent` — the harness proves the matcher
  itself discriminates (fails when fed exactly that text, passes when fed the fixture's own
  expected tests), but confirming the *actual AI output* never says these things requires the
  manual real-provider procedure.
- **Next test technically useful**: every fixture's `expectedUsefulTests` names a real,
  standard diagnostic procedure (voltage-drop test, smoke test, scope test, wiggle test while
  monitoring live data) rather than a part swap — this is a property of the fixture design
  reviewed for automotive accuracy, not something the automated harness can independently verify
  without a real AI response to check against.
- **Safety classification appropriate**: verified automated result for all 22 fixtures (10 general
  + 12 HV) — see the tables above and the passing test suites.
- **Understandable to a technician**: `GuidedDiagnosisPanel`'s structured rendering (summary,
  evidence used, ranked hypotheses with plain-language reasoning, confidence band, missing
  evidence, recommended tests, safety classification with the new HV structured block, one
  question at a time) was designed around exactly this — not independently user-tested with a
  real technician in this pass (no browser verification was possible — see
  [PHASE_2_2_BROWSER_QA.md](PHASE_2_2_BROWSER_QA.md)).

## What this document does not claim

- It does not claim real shop tickets were used.
- It does not claim the AI's hypothesis ranking / recommended-test text was actually generated and
  reviewed — that requires a real provider call under the manual procedure.
- It does not claim a human technician reviewed the rendered UI output for understandability.

These are the genuine, explicit boundaries of what could be validated without live credentials,
a working Browser pane, and real shop data, none of which were available in this session.
