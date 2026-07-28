# Diagnostic Engine Validation

Internal evaluation harness for the Diagnostic Engine's deterministic layers
(`src/lib/diagnostic-engine/validation/{fixtures,evaluate}.ts`,
`test/diagnostic-engine-validation-harness.test.ts`). No customer-identifying information appears
anywhere in this harness — every fixture is a synthetic, generic scenario representative of a
real diagnostic pattern, never an actual customer's case data.

## What this harness does and does not assert

Per the phase brief: *"Do not assert that the system must identify one exact root cause from
insufficient evidence."* This harness never checks "did the engine name the right cause" — it
checks **process**:

- Does the Question Engine ask a useful next question from partial evidence?
- Does the Safety Engine apply an appropriately cautious classification?
- Does the Confidence Engine correctly identify missing evidence rather than claiming false
  completeness?
- Would a set of recommendations be flagged as "parts roulette" if they matched a fixture's own
  list of unacceptable, unverified part-replacement suggestions?

These are checked automatically, in the normal test suite, with **no AI provider call** — they
only exercise the deterministic modules (`question.ts`, `safety.ts`, `confidence.ts`) directly.
Ranking plausible hypotheses, recommending a technically valid next test, and avoiding fabricated
certainty are properties of the AI's own output combined with `probability.ts`/`test-planner.ts`'s
processing of it — those require a real (or realistic synthetic) provider response and are
exercised via the manual procedure below, not the automated suite.

## The 10 fixture categories

`fixtures.ts` — one `ValidationFixture` per category: No crank, Crank but no start, Misfire,
Network/CAN fault, Low-voltage multi-module fault, Sensor circuit fault, Mechanical failure
presenting as an electrical code, Incorrectly replaced part, Intermittent harness fault, EV/
high-voltage safety case. Each carries: vehicle context, complaint, DTCs, an evidence sequence,
a known confirmed root cause (for human reference, never asserted against), expected high-value
next-question field keys, expected useful tests, an expected full-system safety floor, an
expected evidence-only safety floor, and a list of unacceptable ("parts roulette")
recommendations.

## Automated checks (run on every `npx vitest run`)

`evaluate.ts` exports four pure evaluators, all exercised by
`test/diagnostic-engine-validation-harness.test.ts` against all 10 fixtures (41 assertions
total):

1. `evaluateNextQuestion` — `selectNextQuestion` on the fixture's evidence must return one of the
   fixture's `expectedHighValueQuestionFieldKeys`.
2. `evaluateSafetyFloor` — `classifyDriveSafety` on the fixture's evidence alone (no AI text) must
   meet or exceed `expectedSafetyFloorEvidenceOnly`.
3. `evaluateMissingEvidenceIdentified` — `computeEvidenceStrength` must report at least one
   missing category (every fixture is deliberately a partial, early-stage case).
4. `evaluatePartsRouletteAbsent` — a sanity check that the matcher itself discriminates: it must
   fail when fed the fixture's own unacceptable text, and pass when fed the fixture's own expected
   tests.

## Confirmed finding: evidence-only safety classification under-reaches the full-system target

Running the harness surfaced a real gap, not a hypothetical one. `classifyDriveSafety`'s
evidence-only escalation path currently only rises above `safe_to_drive` when the case has
`safety_issue`-typed evidence (from a DTC flagged `safetyRelevance` during ingestion) — it has no
other deterministic signal. Of the 10 fixtures, only **network-can-fault** and
**ev-high-voltage-safety** carry `safety_issue` evidence at all; the other 8 reach only
`safe_to_drive` from evidence alone, even though several of them (crank-no-start, misfire,
low-voltage-multi-module, mechanical-presenting-electrical, intermittent-harness-fault) have a
higher full-system target (`expectedSafetyFloor`) that assumes the AI's own `safetyWarnings` text
will supply the missing signal (e.g. "tow recommended" or "use caution").

**Most notably**, even `ev-high-voltage-safety` — which does carry `safety_issue` evidence — only
reaches `drive_with_caution` from evidence alone, not the `immediate_stop` its full-system target
calls for. `classifyDriveSafety`'s `immediate_stop`/`tow_recommended` tiers currently require a
keyword match in AI-supplied `safetyWarnings` text (`"do not drive"`, `"loss of steering"`,
etc. — see `safety.ts`'s `IMMEDIATE_STOP_KEYWORDS`); there is no evidence-level signal today (e.g.
a dedicated high-voltage/EV evidence type) that alone forces the most severe classification. This
is the single most important open item this harness surfaced: **a high-voltage safety case's
worst-case classification currently depends on the AI choosing the right words**, not on a
guaranteed deterministic floor. Recommended follow-up (not implemented in this pass, to avoid
rushing a safety-critical change without its own dedicated review): add a distinct evidence
signal for high-voltage/EV-relevant DTCs that deterministically forces `immediate_stop`
regardless of what the AI's text says.

This is why `fixtures.ts` tracks two separate fields (`expectedSafetyFloor` — the aspirational
full-system target — and `expectedSafetyFloorEvidenceOnly` — what's actually achievable today) and
the automated test checks the honest, achievable one. Silently lowering `expectedSafetyFloor` to
match current behavior would have hidden this finding instead of surfacing it.

## Manual validation procedure (requires a real provider call — not automated)

To validate the full pipeline (ranking, test recommendation, and full-system safety
classification) against a fixture:

1. Ensure `PROBABILITY_ENGINE_ENABLED=true` (and any other flags under test) in a **non-production**
   environment only, with real `ANTHROPIC_API_KEY` credentials.
2. Create a case and record the fixture's `evidenceSequence` as that case's evidence (via
   `insertEvidence`, or by answering the Question Engine's questions with equivalent answers).
3. Run a real turn (`POST /api/diagnostic-engine/v1/cases/[caseId]/turn`).
4. Compare the response against the fixture:
   - Do `probabilityRanking`'s top hypotheses plausibly relate to `knownConfirmedRootCause`
     (never require an exact string match — only that the hypothesis space is reasonable)?
   - Run `evaluatePartsRouletteAbsent(fixture, response.recommendedTests)` and
     `evaluatePartsRouletteAbsent(fixture, response.probabilityRanking.map(h => h.hypothesis))` —
     both should report `pass: true`.
   - Does `turnResult.safety.status` now reach `expectedSafetyFloor` (not just the evidence-only
     floor), now that the AI's real `safetyWarnings` are in the mix?
   - Does `confidence.overallConfidenceLevel` avoid claiming `high` confidence when the evidence
     set is still clearly partial?

This procedure is intentionally manual — it costs real provider tokens and requires live
credentials, so it is not run as part of the standard `npx vitest run` suite and should only be
exercised in a controlled internal/staging environment, never automatically.
