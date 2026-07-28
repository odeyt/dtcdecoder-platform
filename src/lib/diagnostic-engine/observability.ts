// Phase 2.1 turn observability (docs/PHASE_2_1_OBSERVABILITY.md, migration
// 0033). Best-effort logging only — a logging failure must never turn into
// a user-facing error (matches the established pattern in
// ai-diagnostics/usage.ts's recordAiDiagnosticRun and analytics/events.ts's
// recordEvent), so every call here is caught and console.error'd, never
// thrown.
//
// PRIVACY: this module only ever receives and persists structured,
// categorical fields — never a prompt string, VIN, complaint, symptom
// text, or technician note. Callers must not pass raw text into any field
// here; the TypeScript shape below has no free-text field to misuse.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SubscriptionPlan } from "@/lib/types";
import type { DiagnosticEngineRolloutTier } from "@/lib/diagnostic-engine/feature-flags";
import type { ConfidenceLevel } from "@/lib/scan-diagnostics/schemas";
import type { DriveSafetyStatus } from "@/lib/diagnostic-engine/types";

export type DiagnosticEngineSkipReason = "evidence_unchanged_since_graph";
export type PromptCacheStatus = "not_applicable" | "cache_write" | "cache_hit" | "unknown";
export type DiagnosticEngineRunStatus = "completed" | "skipped" | "failed";
export type DiagnosticEngineFailureCategory =
  | "provider_timeout"
  | "provider_rate_limit"
  | "invalid_structured_response"
  | "database_persistence_failure"
  | "entitlement_exhausted"
  | "feature_disabled"
  | "ownership_denied"
  | "cost_ceiling_exceeded"
  | "unknown_error";

export interface DiagnosticEngineRunEvent {
  userId: string;
  caseId: string;
  requestId: string;
  plan: SubscriptionPlan;
  rolloutTier: DiagnosticEngineRolloutTier;
  providerId?: string | null;
  providerCalled: boolean;
  skipReason?: DiagnosticEngineSkipReason | null;
  promptCacheStatus?: PromptCacheStatus;
  inputTokens?: number | null;
  outputTokens?: number | null;
  estimatedCostUsd?: number | null;
  latencyMs?: number | null;
  evidenceCount: number;
  graphVersion?: number | null;
  hypothesisCount: number;
  confidenceBand?: ConfidenceLevel | null;
  safetyClassification?: DriveSafetyStatus | null;
  schemaValidationResult: "valid" | "invalid" | "not_applicable";
  status: DiagnosticEngineRunStatus;
  failureCategory?: DiagnosticEngineFailureCategory | null;
}

export async function recordDiagnosticEngineRun(event: DiagnosticEngineRunEvent): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("diagnostic_engine_runs").insert({
      user_id: event.userId,
      case_id: event.caseId,
      request_id: event.requestId,
      plan: event.plan,
      rollout_tier: event.rolloutTier,
      provider_id: event.providerId ?? null,
      provider_called: event.providerCalled,
      skip_reason: event.skipReason ?? null,
      prompt_cache_status: event.promptCacheStatus ?? "not_applicable",
      input_tokens: event.inputTokens ?? null,
      output_tokens: event.outputTokens ?? null,
      estimated_cost_usd: event.estimatedCostUsd ?? null,
      latency_ms: event.latencyMs ?? null,
      evidence_count: event.evidenceCount,
      graph_version: event.graphVersion ?? null,
      hypothesis_count: event.hypothesisCount,
      confidence_band: event.confidenceBand ?? null,
      safety_classification: event.safetyClassification ?? null,
      schema_validation_result: event.schemaValidationResult,
      status: event.status,
      failure_category: event.failureCategory ?? null,
    });
    if (error) console.error("[diagnostic-engine] failed to record run observability", error);
  } catch (err) {
    console.error("[diagnostic-engine] failed to record run observability", err);
  }
}

// Best-effort classification of a thrown error into one of the fixed
// failure categories above — never persists the raw error message/stack
// (that still goes to console.error server-side only, matching
// scan-diagnostics/api-errors.ts's existing convention), only a category.
export function classifyFailure(err: unknown): DiagnosticEngineFailureCategory {
  if (err && typeof err === "object" && "name" in err) {
    const name = (err as { name?: string }).name;
    if (name === "AiResponseValidationError") return "invalid_structured_response";
    if (name === "CostCeilingExceededError") return "cost_ceiling_exceeded";
    if (name === "DiagnosticEngineLimitExceededError") return "entitlement_exhausted";
    if (name === "ScanCaseNotFoundError") return "ownership_denied";
  }
  if (err instanceof Error) {
    const message = err.message.toLowerCase();
    if (message.includes("timeout") || message.includes("timed out")) return "provider_timeout";
    if (message.includes("rate limit") || message.includes("429")) return "provider_rate_limit";
  }
  return "unknown_error";
}
