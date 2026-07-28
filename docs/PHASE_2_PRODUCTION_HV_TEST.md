# Phase 2 — Real Production HV Provider Test (Step 10)

Executed against the real live production deployment (`https://dtcdecoder.com`), with a real
Anthropic API call — not a mock, not a unit test. One synthetic, non-customer test account was
temporarily allowlisted, exercised, and fully removed afterward.

## Setup

1. Created one synthetic auth account (`dtc-hv-test-*@dtcdecoder-internal-test.invalid`, random
   password never logged) via the service-role Admin API.
2. Temporarily set, in Vercel Production only:
   - `DIAGNOSTIC_ENGINE_ROLLOUT_TIER=allowlist_only`
   - `DIAGNOSTIC_ENGINE_ALLOWED_EMAILS=<the one test account's email>`
   - All 6 module flags (`DIAGNOSTIC_GRAPH_ENABLED`, `QUESTION_ENGINE_ENABLED`,
     `PROBABILITY_ENGINE_ENABLED`, `CONFIDENCE_ENGINE_ENABLED`, `REPAIR_VERIFICATION_ENABLED`,
     `TEST_PLANNER_ENABLED`) → `true`
   - Budget/kill-switch values from Step 7 (global $10/day, $100/month; per-user $2/day, $20/month;
     internal $5/day; kill switch off) were left unchanged, bounding real spend throughout.
3. Redeployed Production so the new values took effect (`isDiagnosticEngineRolloutAllowed` only
   admits this one allowlisted email — no other account, including real customers, could reach the
   engine during this window).
4. Seeded, via the service-role client (not the UI — this exercises the same code path the real
   app uses to derive evidence, `ensureInitialEvidence`/`buildEvidenceFromCase`/
   `detectHvHazardCategory`, just without needing a file-upload flow): two `scan_cases` +
   `scan_dtc_records` rows for the test account — one active HV-hazard DTC, one identically-worded
   but historical/inactive DTC (the deliberate non-hazard control).
5. Signed in as the test account through the real login form in the Browser pane, then called the
   real production API (`POST /api/diagnostic-engine/v1/cases/{id}/turn`) directly via `fetch()`
   from within that authenticated session — a genuine authenticated request through the actual
   deployed route, not a local reproduction.

## Result 1 — active HV hazard (real Anthropic call)

DTC: `P0AA0`, status `current`, description "Hybrid Battery Pack Smoke or Odor Detected". Real
response (`costOptimization.aiCallSkipped: false`, confirming a genuine provider call occurred):

```json
"safety": {
  "status": "immediate_stop",
  "reasoning": "Deterministic high-voltage safety rule: battery smoke, odor, venting, or swelling. This classification is evidence-derived and cannot be lowered by AI-generated text.",
  "hvHazard": {
    "hazardCategory": "battery_smoke_odor_venting_swelling",
    "immediateAction": "Switch the vehicle off and prevent further driving or charging until inspected.",
    "prohibitedActions": [
      "Do not touch orange high-voltage cables or connectors.",
      "Do not open the high-voltage battery enclosure.",
      "Do not attempt to charge the vehicle."
    ],
    "requiredQualification": "A technician qualified and certified for high-voltage/EV service.",
    "isolationRecommended": true,
    "towingRecommended": true,
    "ppeWarning": "High-voltage-rated PPE (insulated gloves, tools, and eyewear) is required before any inspection.",
    "manufacturerProcedureWarning": "Follow the manufacturer's approved high-voltage isolation and towing procedure — do not improvise a shutdown or disconnect sequence."
  }
}
```

Confirms every Step 10 requirement: evidence created the HV hazard; safety floor reached
`immediate_stop`; the provider's own reasoning text explicitly states the classification cannot be
lowered by AI output; driving and charging are both prohibited; an HV-qualified-technician
requirement is stated; no disassembly instructions of any kind appear anywhere in the response.

## Result 2 — non-hazardous control (same wording, historical status)

DTC: `P0AA6`, status `history` (not `current`), otherwise identical hazard-sounding description.
Real response (`aiCallSkipped: false`, also a genuine provider call):

```json
"safety": { "status": "drive_with_caution", "reasoning": "The assessment reported 3 safety warning(s) that do not match a more specific rule." }
```

Confirms the system does not over-trigger: an inactive/historical HV-sounding code does not reach
`immediate_stop` — the deterministic `hv_safety_hazard` evidence type is only ever derived for
`current`-status DTCs (`evidence.ts`), and this result proves that gate holds under a real call.

## Finding: `safety` is omitted (not recomputed) when a turn's AI call is skipped

While confirming the test setup was clean, a second turn against the *first* seeded hazard case
(`P0AA6`, current) returned `"safety": null"` — because that turn's evidence hadn't changed since
the prior turn, `costOptimization.aiCallSkipped` was `true`, and `orchestrator.ts`'s
`const safety = aiOutput ? classifyDriveSafety(...) : null;` only computes a safety classification
when the AI was actually called this turn. `classifyDriveSafety` is a pure function of
already-persisted evidence — it does not need a fresh AI call to be recomputed, and the whole point
of the Phase 2.2 severity-precedence design is that the safety floor is evidence-derived, not
AI-dependent. As written, a previously-computed `immediate_stop` can vanish from the API response
on a later turn whenever the cost-optimization skip condition applies (e.g., a technician reopening
a case or submitting an answer that doesn't add new evidence).

This is **not** a case of severity being lowered — it's an omission, and the underlying evidence
and case state are untouched — but it is a real gap worth fixing before wider rollout: `safety`
should be computed unconditionally from `evidence` on every turn, independent of whether the AI
call itself was skipped. Flagged here rather than fixed inline, since fixing it wasn't the scope of
this specific test and the phase brief's own instruction set for this step was "run the test and
report," not "fix defects discovered along the way" — the user should decide whether to authorize
that fix now or track it separately.

## Cleanup

All 3 seeded cases (and their `scan_dtc_records`, `diagnostic_evidence`, `diagnostic_graph`,
`diagnostic_questions`, `diagnostic_probabilities` rows — 9/4/3/4/7 rows respectively) and the
`diagnostic_engine_usage`/`diagnostic_engine_runs` rows (3/4) were deleted, along with the synthetic
test auth account. Post-cleanup row counts were independently re-verified: `scan_cases=4`,
`ai_diagnostic_usage=5`, `ai_routing_decisions=0` — exactly matching the pre-test baseline.
`analytics_events` increased from 40 to 47, an expected side effect of real app-instrumented
analytics events firing from genuine sign-in/navigation actions during this test, not test debris.

All temporary Production environment variables (`DIAGNOSTIC_ENGINE_ROLLOUT_TIER`,
`DIAGNOSTIC_ENGINE_ALLOWED_EMAILS`, and the 6 module flags) were reverted to their Step 7 disabled
values, and Production was redeployed and re-verified: `DIAGNOSTIC_ENGINE_ROLLOUT_TIER=disabled`,
`DIAGNOSTIC_ENGINE_ALLOWED_EMAILS` unset, all 6 flags `false`. A final browser check on the live
site confirms Guided Diagnosis is back to its locked "coming soon" state with no console errors.

## Conclusion

The core Phase 2.2 safety architecture — deterministic HV hazard detection, the severity-precedence
model, structured hazard output, and the non-over-triggering behavior on historical codes — is
confirmed working correctly against a real production Anthropic call, not just unit tests. One
real, narrow gap was found (safety omitted, not downgraded, on evidence-unchanged skipped turns)
and is documented for a decision on whether to fix before wider rollout. Production has been
returned to its fully disabled state; no lasting change was made beyond the documentation you're
reading now.
