// Phase 2 diagnostic-engine feature flags (docs/PHASE_2_ARCHITECTURE.md).
// Every flag defaults OFF — an unconfigured environment has none of this
// engine wired into any live request path, so Phase 1 behavior is
// completely unaffected until these are explicitly turned on. Read fresh
// from process.env on each call (functions, not module-level consts),
// matching the established pattern in
// src/lib/ai-diagnostics/orchestrator-config.ts.
import "server-only";

function flag(name: string): boolean {
  return process.env[name] === "true";
}

export const DIAGNOSTIC_ENGINE_FLAGS = {
  diagnosticGraphEnabled: () => flag("DIAGNOSTIC_GRAPH_ENABLED"),
  questionEngineEnabled: () => flag("QUESTION_ENGINE_ENABLED"),
  probabilityEngineEnabled: () => flag("PROBABILITY_ENGINE_ENABLED"),
  confidenceEngineEnabled: () => flag("CONFIDENCE_ENGINE_ENABLED"),
  repairVerificationEnabled: () => flag("REPAIR_VERIFICATION_ENABLED"),
  testPlannerEnabled: () => flag("TEST_PLANNER_ENABLED"),
};
