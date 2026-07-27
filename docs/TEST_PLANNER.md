# Test Planner, Safety Engine, Repair Verification

The three modules that turn a ranked diagnosis into actionable, safety-aware next steps
(`src/lib/diagnostic-engine/test-planner.ts`, `safety.ts`, `repair-verification.ts`).

## Test Planner

"Instead of 'Replace Part,' generate Recommended Diagnostic Tests ranked by Cost, Difficulty,
Probability, Risk." The AI's own `recommendedTests` only carry `step`/`purpose`/`expectedResult`
(`DiagnosticAiOutputSchema`) — difficulty, risk, and cost are **deterministically derived** from
each test step's own text via a conservative keyword lookup (the same style of rule as the Safety
Engine's keyword scan below), rather than trusting the AI to self-rate its own test consistently
across runs.

```ts
interface PlannedTest {
  rank: number; step: string; purpose: string; expectedResult: string;
  difficulty: "easy" | "moderate" | "hard" | "professional";
  risk: "low" | "moderate" | "high";
  costLevel: "low" | "moderate" | "high"; // categorical shop-time band, never a dollar estimate
  relatedHypothesisRanks: number[];
}
```

`costLevel` tracks `difficulty` directly (harder tests reliably need more time/specialized
equipment; this app has no independent cost model to draw on, so a second, possibly-inconsistent
cost heuristic would just be a second guess at the same signal).

**"Probability"** — the spec's 4th ranking axis — isn't a separate fabricated field. A test is
linked to the ranked hypotheses it helps confirm (`relatedHypothesisRanks`, matched via
substring against each hypothesis's own `requiredTests`), and the best-linked hypothesis's
categorical confidence feeds the ranking score directly:

```
score = bestRelatedConfidenceWeight * 10 - riskPenalty - difficultyPenalty
```

Sorted descending, so the test that confirms/rules out the currently most-confident hypothesis,
at the lowest risk and difficulty, ranks first — matching "instead of guessing, run the
highest-value test next."

## Safety Engine

"Every case must classify Safe to Drive / Drive with Caution / Tow Recommended / Immediate Stop,
with explanation" (`classifyDriveSafety`). Deterministic keyword/evidence rules, not an AI
judgment call — the same rule-engine-over-structured-facts approach as the comm-code replacement
guard in `safety-rules.ts`. Ordered most-severe-first, first match wins:

1. **Immediate stop** — a safety warning matches an immediate-stop keyword (do not drive, brake/steering
   failure, fire risk, ...).
2. **Tow recommended** — a warning matches a no-start/tow keyword.
3. **Drive with caution** — the case has `safety_issue` evidence (a safety-relevant DTC), OR a
   warning matches a caution keyword, OR any unrecognized non-empty warning exists (fails safe
   toward caution rather than silently ignoring an unrecognized warning).
4. **Safe to drive** — no safety-relevant evidence and no warnings at all.

The AI's own free-text `safetyWarnings` are one input signal, never the sole source of truth — a
case can be flagged `drive_with_caution` purely from having `safety_issue` evidence even if the
AI wrote nothing alarming.

## Repair Verification

"After a repair, generate a verification checklist" — a **fixed deterministic template**, not
AI-generated, mirroring the same "deterministic checklist, no AI judgment" approach as the
Confidence Engine's evidence checklist:

```
Clear all diagnostic trouble codes
Perform a road test replicating the original complaint conditions
Monitor live data for the parameters relevant to the diagnosis
Recheck for pending DTCs after the road test
Confirm all readiness monitors report complete (not incomplete)
Verify the customer's original complaint no longer occurs
```

Unlike the Diagnostic Graph (one current-state row per case), `repair_verifications` has a plain,
**non-unique** index on `case_id` — a case can go through more than one repair-and-reverify cycle,
and each is kept as its own row (case-memory history), never overwritten.
`createRepairVerification`/`getLatestRepairVerification`/`updateRepairVerificationItem` are the
persistence surface; `completedAt` is set only once every checklist item is marked complete.
Independent of a diagnostic-engine "turn" — verifying a repair never calls the AI provider.
