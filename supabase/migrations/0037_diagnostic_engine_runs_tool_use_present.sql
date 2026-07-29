-- Phase 23 (Playwright QA implementation) — closes a real observability
-- gap found while investigating repeated AI_RESPONSE_VALIDATION_FAILED
-- responses in production: diagnostic_engine_runs.schema_validation_result
-- already distinguishes "valid"/"invalid"/"not_applicable", but on an
-- "invalid" row there was no way to tell apart the model returning NO
-- structured tool call at all (a refusal/plain-text response) from the
-- model returning a tool call whose input failed
-- DiagnosticAiOutputSchema.safeParse (a shape mismatch). Both currently
-- produce the same generic AI_RESPONSE_VALIDATION_FAILED outcome
-- client-side and the same failure_category server-side — this column
-- lets a human distinguish them after the fact without ever storing the
-- raw (potentially sensitive) provider output.
--
-- Idempotent, matching this project's established migration pattern
-- (docs/PHASE_2_PRODUCTION_MIGRATION_RUNBOOK.md): additive column only,
-- IF NOT EXISTS guard, no data migration needed (existing rows simply
-- read null — "unknown", not "false").
alter table diagnostic_engine_runs
  add column if not exists tool_use_present boolean;

comment on column diagnostic_engine_runs.tool_use_present is
  'Only meaningful when schema_validation_result = ''invalid''. true = the model returned a tool_use block whose input failed schema validation; false = the model returned no tool_use block at all; null = not applicable (valid/skipped run, or this row predates this column).';
