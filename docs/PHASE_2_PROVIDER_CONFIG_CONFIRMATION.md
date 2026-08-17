# Phase 2 — Provider Configuration Confirmation (Step 8)

> **Historical snapshot.** Confirms the Anthropic-only configuration as it stood at this phase.
> Anthropic was later fully retired in the OpenAI migration — `anthropic-provider.ts` no longer
> exists; the equivalents today live in `shared-prompt.ts` and `openai-provider.ts`. Left
> otherwise unchanged as a record of what was confirmed at the time.

No new provider was added — the existing single-provider abstraction (Anthropic) is reused
unchanged, per the phase brief's explicit prohibition on adding OpenAI/Gemini/multi-model routing
in this release. This step confirms the existing configuration, it doesn't change it.

| Requirement | Confirmed via | Status |
|---|---|---|
| Provider key exists only in server environment variables | `ANTHROPIC_API_KEY` is server-only (no `NEXT_PUBLIC_` prefix), confirmed `Production`-scoped only in Vercel (`vercel env ls`), unchanged by this release | Confirmed |
| Model ID explicitly configured | `SCAN_REPORT_MODEL_ID = modelForTask("scanMainAnalysis")` (`src/lib/scan-diagnostics/ai/anthropic-provider.ts:35`, since retired — now `openai-provider.ts`) — resolved from the model-routing config, never a hardcoded/implicit default | Confirmed |
| Token ceiling enforced | `SCAN_REPORT_MAX_TOKENS` (same file); Diagnostic Engine turns additionally pre-flight-checked against the Phase 2.2 cost ceiling guard before any call | Confirmed |
| Request timeout enforced | `getRequestLimits().providerTimeoutMs`, `src/lib/ai-diagnostics/orchestrator-config.ts:79` — reads `AI_PROVIDER_TIMEOUT_MS`, defaults to 30000ms, clamped to [1000, 120000]ms even if misconfigured | Confirmed (safe default applies even though this var isn't explicitly set in Vercel — not required, since the default is already safe) |
| Structured-output validation active | `DiagnosticAiOutputSchema.safeParse(...)` (`anthropic-provider.ts:282`, since retired — now enforced via `zodResponseFormat(DiagnosticAiOutputSchema, ...)` in `openai-provider.ts`) — a zod schema validates every response; the Diagnostic Engine's own response path has the equivalent check (`schema_validation_result` column in `diagnostic_engine_runs`, populated `'valid'`/`'invalid'`) | Confirmed |
| Prompt caching enabled where supported | Existing Anthropic provider integration; the known limitation (real cache-hit token counts not yet surfaced into `cached_input_tokens`) is documented in [PHASE_2_2_COST_GUARDRAILS.md](PHASE_2_2_COST_GUARDRAILS.md) and unchanged by this release — not a regression | Confirmed (with documented limitation) |
| Provider failure does not destroy case state | `runDiagnosticEngineTurn`'s failure path (`orchestrator.ts`) releases the usage-ledger reservation and records a `failed` observability row without ever fabricating a completed response; case evidence/graph already persisted before the AI call remains intact regardless of provider outcome — tested in `test/diagnostic-engine-orchestrator.test.ts`'s "provider failure handling" block | Confirmed |
| Failed structured responses are rejected safely | A `safeParse` failure or `AnthropicSchemaValidationError` never becomes a fabricated diagnosis — it's classified into `invalid_structured_response` (see `diagnostic_engine_runs.failure_category` check constraint, migration 0033) and surfaces the generic failure UI state, per Phase 2.1 Step 9 | Confirmed |
| No complete prompts or full provider responses logged | `diagnostic_engine_runs` (migration 0033) has no column for prompt text, VIN, complaint text, or any free-text content — only counts, categories, and short controlled-vocabulary strings, enforced by check constraints | Confirmed |

## Result

All 9 provider-configuration requirements are satisfied by existing, already-tested code — this
release does not modify the provider integration itself, only adds the Diagnostic Engine's
consumption of it (entitlements, budget guard, observability, safety), which was the subject of
Steps 1-7 above.
