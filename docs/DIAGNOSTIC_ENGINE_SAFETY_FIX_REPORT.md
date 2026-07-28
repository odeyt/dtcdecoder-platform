# Fix Deterministic Safety Persistence — Final Report

Branch: `fix/diagnostic-engine-safety-persistence` (created from `main` at `124b2d8`).

## 1. Audit finding

Full detail in [DIAGNOSTIC_ENGINE_SAFETY_NULL_AUDIT.md](DIAGNOSTIC_ENGINE_SAFETY_NULL_AUDIT.md).
Summary: `orchestrator.ts`'s final `safety` computation was gated behind `aiOutput ?`, and `aiOutput`
is only ever set when the AI provider is actually called this turn. Two branches reach the
function's return statement with `aiOutput === null` — the cost-optimization skip
(`shouldSkipRedundantAiCall` true, confirmed live in production) and the "module flag off" path —
so both returned `safety: null` even when real, persisted hazard evidence existed. Kill switch,
budget hard-stop, unsupported-provider, and provider-failure all **throw** rather than returning a
`safety: null` in a 200 response — a structurally different, already-safe failure mode, not part of
this specific bug. Scope of this fix is intentionally limited to the confirmed defect (see the
audit doc's closing section for why the budget/failure paths were not restructured into a
"graceful degraded 200" model in this pass).

## 2. Fix summary

`src/lib/diagnostic-engine/orchestrator.ts`: `classifyDriveSafety(evidence, aiOutput?.safetyWarnings ?? [])`
is now computed unconditionally, once, at the same point in the function, regardless of whether
`aiOutput` is set. `classifyDriveSafety` only ever needed `evidence` — the coupling to `aiOutput`
was accidental, not a real data dependency. The `DiagnosticEngineTurnResult.safety` type was
tightened from `DriveSafetyClassification | null` to `DriveSafetyClassification` (never null),
enforcing the fix at the type level, not just at runtime.

Not persisted per-turn (see audit doc's "Persistence" section for the explicit reasoning): the
classifier is a pure, zero-cost, in-memory function of already-persisted evidence — recomputing
fresh every time is both cheaper and strictly safer than caching a result that could go stale
relative to newer evidence. No new migration was needed or added.

## 3. Files changed

| File | Purpose |
|---|---|
| `src/lib/diagnostic-engine/orchestrator.ts` | The fix itself — unconditional safety computation, tightened return type |
| `src/app/api/diagnostic-engine/v1/cases/[caseId]/turn/route.ts` | Added the alertable canary log (`ALERT diagnostic_engine_safety_missing`) — defensive, should never fire post-fix |
| `test/diagnostic-engine-orchestrator.test.ts` | Updated 1 existing test whose old assertion encoded the bug (`safety` expected `null` with every flag off); added 8 new regression tests covering the required core scenarios |
| `test/diagnostic-engine-security.test.ts` | Added 1 route-level test (through the real HTTP handler, with a mocked Anthropic provider) proving the fix holds end-to-end, not just at the orchestrator-function level |
| `docs/DIAGNOSTIC_ENGINE_SAFETY_NULL_AUDIT.md` | The required audit-first document |
| `docs/DIAGNOSTIC_ENGINE_COST_VALIDATION_MATRIX.md` | Step 12 cost/budget validation matrix |
| `docs/DIAGNOSTIC_ENGINE_SAFETY_FIX_REPORT.md` | This report |

## 4. Tests

```
npx tsc --noEmit    →  clean
npm run lint         →  clean
npx vitest run       →  696/696 passed (76 test files, up from 686 pre-fix)
npm run build        →  production build succeeds
```

New/updated tests, by required scenario:

| Required scenario | Test |
|---|---|
| Active HV hazard, AI call runs | `orchestrator.test.ts` — "active HV hazard, AI call runs: immediate_stop, drivingAllowed=false, chargingAllowed=false" |
| Active HV hazard, AI skipped | `orchestrator.test.ts` — "active HV hazard, AI call skipped (unchanged evidence): safety is NOT null and still immediate_stop" (this is the exact real production scenario that failed before the fix) |
| Historical/inactive code, AI call runs | `orchestrator.test.ts` — "historical/inactive HV-worded code, AI call runs: does not reach immediate_stop" |
| Historical/inactive code, AI skipped | `orchestrator.test.ts` — "historical/inactive HV-worded code, AI call skipped: safety is NOT null and still does not over-trigger" |
| Newly added hazard evidence after a prior safe response | `orchestrator.test.ts` — "adding new hazard evidence after a prior safe turn forces a fresh AI call (does not skip) and reclassifies to immediate_stop" |
| Hazard evidence removed/changed current→historical | `orchestrator.test.ts` — "hazard evidence removed/changed from current to historical between turns reclassifies down from immediate_stop" |
| Empty evidence | `orchestrator.test.ts` — "empty evidence classifies safe_to_drive, never null" |
| Unauthorized/cross-user access | `orchestrator.test.ts` — "unauthorized cross-user access is denied before any safety computation occurs" |
| Provider failure | `orchestrator.test.ts` — "a malformed/failing AI provider call never fabricates a completed response..." (confirms the pre-existing, already-correct fail-closed behavior; provider failure throws rather than returning a body at all — see audit doc's scope note) |
| Real route round-trip | `security.test.ts` — "a successful turn through the real route never returns safety: null in its JSON body" |

Scenarios from the request list not directly testable in this codebase's actual architecture, with
reasoning: **cache hit** (no separate cache layer exists distinct from the cost-optimization skip —
same mechanism, already covered); **budget hard stop / provider timeout / provider auth failure /
retry path / deterministic-only mode** (all throw before constructing a response — already covered
by the existing kill-switch/budget test block, which this fix doesn't touch or need to change);
**multiple simultaneous hazards** (the HV hazard detector matches the *first* pattern in an ordered
list per DTC and evidence-floor logic already takes the single most severe result across all
evidence items — existing `test/diagnostic-engine-safety.test.ts` and the HV validation harness
already cover multi-evidence scenarios at the `classifyDriveSafety` unit level; not re-duplicated
here). **Cache output conflicting with new safety evidence** — covered by the "adding new hazard
evidence" test above, which proves fresh evidence always wins.

## 5. API contract

**Before**: `DiagnosticEngineTurnResult.safety: DriveSafetyClassification | null` — `null` whenever
the AI call was skipped or the module flag was off, even with real hazard evidence present.

**After**: `DiagnosticEngineTurnResult.safety: DriveSafetyClassification` — never null for any
successful (non-throwing) turn, regardless of `aiCallSkipped`. No breaking shape change for
existing consumers: `GuidedDiagnosisPanel.tsx` already used a truthy check (`turnResult?.safety &&`)
that continues to work correctly — it will now simply render the safety card on turns where it
previously, incorrectly, rendered nothing.

The phase brief's suggested richer contract (`metadata.safetyClassifierVersion`,
`metadata.evidenceFingerprint`, `degradedMode`, `cacheHit` flags) was **not** added in this pass —
it implies a broader response-schema redesign coupled to the budget/failure-path behavior change
this fix deliberately left out of scope (see audit doc). Flagging this explicitly as a decision
point rather than silently adding partial, unused fields.

## 6. Safety invariants — confirmed

1. AI output cannot lower deterministic severity — unchanged, pre-existing (`classifyDriveSafety`'s severity-precedence logic).
2. Cached AI output cannot lower deterministic severity — no separate cache exists; N/A, same as #1.
3. Skipped AI execution cannot remove safety information — **fixed by this change**, tested.
4. Provider failure cannot remove safety information — provider failure throws (no response body at all) rather than silently omitting `safety` from a 200 — a stricter guarantee than "recompute and include a degraded body," not weaker.
5. Budget limits cannot remove safety information — same reasoning as #4.
6. A historical DTC must not automatically trigger an active immediate-stop condition — unchanged, pre-existing, re-tested explicitly in this pass.
7. Current evidence must take priority over cached evidence — trivially true; no cache to prioritize away from.
8. An active HV hazard must continue to prohibit driving and charging where applicable — unchanged (`deriveOperationalGuidance`), re-tested explicitly in this pass.
9. No disassembly/bypass instructions in an immediate-stop response — unchanged; `buildHvHazardDetail` never included any (confirmed again via the real production HV test).
10. Safety classification attached at the top level consistently — unchanged; `safety` has always been a top-level sibling of `response`/`graph` in `DiagnosticEngineTurnResult`, now simply never null.

## 7. Cost validation

Full matrix: [DIAGNOSTIC_ENGINE_COST_VALIDATION_MATRIX.md](DIAGNOSTIC_ENGINE_COST_VALIDATION_MATRIX.md).
15/17 items pass with direct existing-test evidence; 2 are not applicable to this codebase's actual
architecture (no "conditional review" or "shop" concepts exist here). This fix does not touch any
budget/cost code, so no new cost regression is possible from it.

## 8. Production state

- Global rollout: **`disabled`** — unchanged since the Step 10 revert; not touched by this fix.
- OpenAI primary: disabled (this codebase's scan-report Multi-Model Orchestrator defaults to
  Anthropic primary; OpenAI is only ever used if explicitly enabled elsewhere, unrelated to and
  unchanged by this fix).
- Gemini: disabled, unchanged.
- No synthetic account remains — none was created for this fix; it was validated entirely against
  the mocked test suite, per the brief's own preference for mocked providers on this kind of
  regression work.
- No test allowlist remains in Production — `DIAGNOSTIC_ENGINE_ALLOWED_EMAILS` is unset, unchanged
  since the Step 10 revert.
- No temporary environment variables remain — none were added for this fix.
- No secrets were exposed — no credentials, API keys, or customer data appear in any file changed
  or any log line added (the new canary log only ever contains `caseId`/`requestId`, both
  server-generated/client-supplied identifiers, never evidence content).

This fix has **not** been validated against real production yet. Per the brief's own conditional
wording ("If production validation is required...") and given the fix was validated thoroughly at
the unit/route level using the exact real-production scenario that surfaced the bug, a fresh
synthetic-account production re-validation is offered as optional, not performed automatically —
see the closing question to the user.

## 9. Git

- Branch: `fix/diagnostic-engine-safety-persistence`
- Base: `main` at `124b2d8`
- Commit: (recorded after this report is committed — see below)
- Pushed: not yet — awaiting explicit confirmation before pushing/merging, per this project's
  established pattern throughout every prior phase.
- Deployed: no — `main` and production remain exactly as they were after the Step 10 revert.

No merge to `main` and no broader rollout occurred as part of this fix, per the explicit closing
instruction.
