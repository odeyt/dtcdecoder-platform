# `diagnostic_engine_runs.tool_use_present` (Phase 23)

## Finding

While building the Playwright QA framework and investigating the
`AI_RESPONSE_VALIDATION_FAILED` responses seen repeatedly during real
production owner testing, an inspection of `diagnostic_engine_runs` showed
that a failed run's `schema_validation_result = 'invalid'` never
distinguished between the model's two structurally different failure
shapes:

1. The model returned **no** `tool_use` block at all (a plain-text or
   refused response).
2. The model returned a `tool_use` block, but its `input` failed
   `DiagnosticAiOutputSchema.safeParse` (a shape mismatch).

Both throw the same `AiResponseValidationError`, both map to the same
`AI_RESPONSE_VALIDATION_FAILED` client response, and — until this fix —
both recorded the same server-side row shape, making it impossible to tell
which failure mode was actually occurring in production without reading
raw provider output (which this table deliberately never stores).

## Fix

- Migration `0037_diagnostic_engine_runs_tool_use_present.sql` — additive,
  nullable `boolean` column.
- `AiResponseValidationError` (`src/lib/scan-diagnostics/api-errors.ts`) now
  carries an optional `toolUsePresent: boolean` set at the two throw sites
  in `callSubmitDiagnosisTool` (`src/lib/scan-diagnostics/ai/anthropic-provider.ts`):
  `false` when no `tool_use` block was found, `true` when one was found but
  failed validation.
- `orchestrator.ts`'s failed-run observability call extracts this flag from
  the caught error (when it's an `AiResponseValidationError`) and threads
  it into `recordDiagnosticEngineRun`.
- Every other call site of `AiResponseValidationError` (the OpenAI
  provider, the Anthropic `review()` path — neither part of the
  Diagnostic Engine turn flow) leaves the flag `undefined`, which persists
  as `null` — "not applicable," matching `schema_validation_result`'s own
  existing "not applicable" branch.

## Privacy

Still just one boolean. No raw provider output, prompt text, or error
message is stored — the constraint this table has always enforced is
unchanged.

## Tests

Two new cases in `test/diagnostic-engine-orchestrator.test.ts`'s
observability block confirm `tool_use_present` records `false` and `true`
respectively for the two failure shapes.
