# Audit — `safety: null` on Skipped-AI Diagnostic Engine Turns

## Exact path that caused `safety: null`

`src/lib/diagnostic-engine/orchestrator.ts:311` (before this fix):

```ts
const safety = aiOutput ? classifyDriveSafety(evidence, aiOutput.safetyWarnings) : null;
```

`classifyDriveSafety` is gated behind `aiOutput`, which is only ever set inside the
`probabilityEngineEnabled` branch's "AI actually called" path (line 233,
`aiOutput = result.output;`). Every other path through the function — including the cost-
optimization skip (`shouldSkipRedundantAiCall` true, `aiCallSkipped = true`, no AI call, `aiOutput`
stays `null`) and the "module flags off" path (`probabilityEngineEnabled()` false, the whole
`if` block at line 136 never runs) — falls through to the bottom with `aiOutput === null`, so
`safety` is unconditionally `null`.

This was found and confirmed via a real production Anthropic call
([PHASE_2_PRODUCTION_HV_TEST.md](PHASE_2_PRODUCTION_HV_TEST.md)): a case with real `hv_safety_hazard`
evidence returned `immediate_stop` on its first turn (AI called), then `safety: null` on an
immediate second turn against the same, unchanged evidence (AI skipped) — the deterministic
`immediate_stop` classification silently disappeared from the API response even though the
underlying hazard evidence was still present and unchanged.

## Every execution branch traced

| Branch | Reaches the final `return {...}`? | `aiOutput` set? | `safety` before fix |
|---|---|---|---|
| `probabilityEngineEnabled()` false (module off) | Yes | No | `null` — **the bug** |
| `probabilityEngineEnabled()` true, `provider.runDiagnosticEngineTurn` missing | No — throws `DiagnosticEngineProviderUnsupportedError` immediately | n/a | No response object returned at all (API route converts to a safe error) |
| Cost-optimization skip (`shouldSkipRedundantAiCall` true) | Yes | No | `null` — **the bug**, and the exact scenario the real production test caught |
| Kill switch active | No — throws `DiagnosticEngineKillSwitchError`, caught and re-thrown after recording a failed run | n/a | No response object returned at all |
| Aggregate budget hard stop | No — throws `DiagnosticEngineBudgetExceededError`, same re-throw pattern | n/a | No response object returned at all |
| Real AI call succeeds | Yes | Yes | Computed correctly (this path was never broken) |
| Real AI call throws (timeout, malformed response, etc.) | No — usage slot released, failure recorded, error re-thrown | n/a | No response object returned at all |

**Important distinction this audit surfaces**: there are two structurally different "no safety"
outcomes in the current code, not one. (1) The confirmed bug — a `200`-shaped
`DiagnosticEngineTurnResult` object *is* returned, but its `safety` field is `null`. This happens
on exactly two branches: module-disabled and cost-optimization-skip. (2) Kill switch, budget block,
provider failure, and unsupported-provider all **throw** — no `DiagnosticEngineTurnResult` is ever
constructed at all; the API route's `toSafeErrorResponse` converts the thrown error into a safe
error HTTP response with a different shape entirely (no `safety` key, no `response` key — just an
`error` message and status code). These are not cases of "successfully loaded diagnostic case with
classifiable evidence returning `safety: null`" in the sense the phase brief describes — they never
return a `DiagnosticEngineTurnResult` shape at all, successful or otherwise.

## Where the deterministic safety classifier is invoked today

Only one call site: `orchestrator.ts:311`, gated behind `aiOutput ?`. `classifyDriveSafety` itself
(`safety.ts:151`) takes `(evidence: EvidenceItem[], safetyWarnings: string[])` — evidence is the
only *required* input for the deterministic floor; `safetyWarnings` may be an empty array (the
AI-text signal simply can't raise anything beyond the evidence floor in that case, which is exactly
the correct, safe behavior — see `classifyFromWarningsAlone([])` returning `safe_to_drive`).
Nothing about this function's signature required `aiOutput` to exist — the gating was an
unnecessary coupling introduced when Slice G (the Safety Engine) was wired in as a pass-through
after the AI branch, not a genuine data dependency.

## Response schema and existing tests

`DiagnosticEngineTurnResult.safety` (`orchestrator.ts:73`) is already typed
`DriveSafetyClassification | null` — nullable by design, intended for the "engine not reachable at
all" case, not for "engine reachable but this specific turn happened to skip the AI." One existing
test explicitly asserted the old (buggy) behavior:
`test/diagnostic-engine-orchestrator.test.ts:205`, `"with every flag off ... expect(result.safety).toBeNull()"`
— this assertion is updated as part of this fix (see Tests section) since a evidence-derived
classification is now always computed, even with every module flag off.

## Persistence

`safety` is **not** persisted to any table today — it's computed fresh on every turn and returned
directly in the API response. There is no `diagnostic_engine_runs.safety_classification_json`
equivalent; the only safety-adjacent column that exists is
`diagnostic_engine_runs.safety_classification` (migration 0033), a single enum-like `text` column
recording only the `status` string for observability, not the full classification object, and only
ever written on `provider_called = true` rows. This audit's fix keeps this: recomputing
`classifyDriveSafety(evidence, ...)` is a pure, in-memory, zero-cost operation (no I/O, no external
call) — there is no correctness or cost reason to persist and later retrieve a cached copy instead
of recomputing it fresh every time, and recomputing fresh is strictly safer (invariant 7: "current
evidence must take priority over cached evidence" holds trivially if there is no cache to
prioritize away from). Per the phase brief's own "if not persisted, document why" requirement: this
is why it stays unpersisted.

## Client tolerance for a non-null `safety` on skipped turns

`GuidedDiagnosisPanel.tsx` (`src/components/GuidedDiagnosisPanel.tsx:277`) already guards its safety
rendering with `{turnResult?.safety && (...)}` — a plain truthy check, not a check for a specific
prior shape. It renders `turnResult.safety.status`, `.reasoning`, and optionally `.hvHazard` — all
fields `classifyDriveSafety` already produces regardless of which internal branch computed it. No
client-side change is required; a previously-`null` skipped-turn response that now carries a real
classification will simply start rendering the safety card where it previously rendered nothing.

## Scope decision: kill switch / budget / provider-failure paths are NOT changed in this fix

The phase brief's "Expected behavior by execution path" section describes budget-restricted and
provider-failure paths as returning a graceful `200` with `degradedMode: true` and a valid safety
classification, rather than throwing. That is a materially different behavior from what exists
today (a thrown error, converted to a safe generic `503`/`403`-class response, matching the
explicit Phase 2.2 design decision to fail closed and never expose budget internals — see
[PHASE_2_2_COST_GUARDRAILS.md](PHASE_2_2_COST_GUARDRAILS.md)). Changing "throw and fail the request"
to "return 200 with a degraded body" is a genuine API-contract change with its own tradeoffs (it
changes what the client must handle, changes whether a blocked request still consumes an
entitlement/usage slot semantically, and changes the "never expose that a limit was hit" posture
Phase 2.2 deliberately chose). This fix does **not** make that change — it is out of scope for "the
deterministic safety gap," which is specifically about `DiagnosticEngineTurnResult.safety` being
`null` in a 200 response, not about whether error paths should stop throwing. This is a decision for
the account owner, not something to change unilaterally inside a bug-fix pass. Flagged here, not
silently done, and not silently skipped.
