# Fix — `diagnostic_engine_runs.safety_classification` Never Populated

## Finding

Discovered while validating the `safety: null` fix against real production
([PHASE_2_PRODUCTION_HV_TEST.md](PHASE_2_PRODUCTION_HV_TEST.md)-style checks): every row in
`diagnostic_engine_runs` had `safety_classification = null`, including successful `completed` turns
that returned a real `immediate_stop` classification to the caller.

## Root cause

`recordDiagnosticEngineRun` (`observability.ts`) already accepted an optional
`safetyClassification?: DriveSafetyStatus | null` field and already mapped it to the
`safety_classification` column — the field was never a schema or interface gap. The gap was purely
at the four call sites in `orchestrator.ts`: none of them passed `safetyClassification`, because at
the point each one ran, the function's `classifyDriveSafety(...)` call hadn't executed yet — it sat
at the very bottom of `runDiagnosticEngineTurn`, after every `recordDiagnosticEngineRun` call.

## Fix

`safety` is now computed once, early — right after evidence is loaded, using an empty
`safetyWarnings` array (the correct evidence-only floor for every branch that never reaches a
successful AI call: module disabled, cost-optimization skip, budget/kill-switch block, provider
failure). It's reassigned only after a successful AI call, incorporating `aiOutput.safetyWarnings`
(which can only raise the result, never lower it, per the existing severity-precedence design in
`safety.ts` — unchanged). All four `recordDiagnosticEngineRun` call sites (skip, budget/kill-switch
failure, completed, provider failure) now pass `safetyClassification: safety.status`. The final
return at the bottom reuses the same `safety` value instead of recomputing it a second time.

## Tests

Two new tests in `test/diagnostic-engine-orchestrator.test.ts`'s observability block: confirm
`safety_classification` is non-null (and a valid `DriveSafetyStatus` value) on both a `completed`
and a `skipped` run.

```
npx tsc --noEmit    →  clean
npm run lint         →  clean
npx vitest run       →  698/698 passed (up from 696)
npm run build         →  succeeds
```

## Scope

This is purely additive to the four existing observability calls — no behavior visible to a caller
changes (the API response shape and values are identical to the previous fix). Not deployed to
production as part of this change; awaiting the same push/merge confirmation as the prior fix.
