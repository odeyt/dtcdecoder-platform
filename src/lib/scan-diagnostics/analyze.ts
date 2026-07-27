// Analyze-stage orchestration, separated from the HTTP route so it can be
// unit-tested with a fake AI provider instead of hitting Anthropic. Owns
// the full sequence: usage gate -> status transition -> build canonical
// input -> run provider -> safety review -> confidence -> persist report
// -> final status transition.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCaseForOwner, transitionCaseStatus } from "@/lib/scan-diagnostics/cases";
import { recordAiDiagnosticUsage, releaseAiDiagnosticUsage, recordAiDiagnosticRun } from "@/lib/ai-diagnostics/usage";
import { estimateCostMicros, computeActualCostMicros, guardCostCeiling, CostCeilingExceededError } from "@/lib/ai-diagnostics/cost";
import { DIAGNOSTIC_CREDIT_WEIGHTS } from "@/lib/pricing";
import { buildCanonicalDiagnosticInput } from "@/lib/scan-diagnostics/canonical-input";
import { buildCanonicalVehicleScan } from "@/lib/scan-diagnostics/canonical-scan";
import { detectPatterns } from "@/lib/scan-diagnostics/patterns";
import { runSafetyReview } from "@/lib/scan-diagnostics/safety-rules";
import { computeConfidence } from "@/lib/scan-diagnostics/confidence";
import { assembleAndPersistReport } from "@/lib/scan-diagnostics/report";
import { AiResponseValidationError, ScanAnalysisFailedError } from "@/lib/scan-diagnostics/api-errors";
import { recordEvent } from "@/lib/analytics/events";
import { SCAN_REPORT_MODEL_ID, SCAN_REPORT_MAX_TOKENS } from "@/lib/scan-diagnostics/ai/anthropic-provider";
import { env } from "@/lib/env";
import { runOrchestratedDiagnosis } from "@/lib/scan-diagnostics/ai/orchestrator";
import { persistRoutingDecision } from "@/lib/scan-diagnostics/ai/routing-log";
import { BudgetHardStopError } from "@/lib/ai-diagnostics/budget-guard";
import type { DiagnosticAIProvider, DiagnosticAIProviderResult } from "@/lib/scan-diagnostics/ai/provider";
import type { ScanCase, ScanDtcRecord, ScanExtraction, ScanReport, ScanSystem, SubscriptionPlan } from "@/lib/types";

export interface ScanAnalysisResult {
  case: ScanCase;
  report: ScanReport;
}

export async function runScanAnalysis(
  userId: string,
  caseId: string,
  plan: SubscriptionPlan,
  provider: DiagnosticAIProvider,
): Promise<ScanAnalysisResult> {
  await getCaseForOwner(userId, caseId);

  // Reserve the slot atomically (before the expensive AI call) using the
  // case's own id as the idempotency key — a retry after a released
  // failure (see the catch block below) re-enters here as a fresh
  // reservation; a retry after a successful analysis finds the row still
  // present and is a no-op, never a double charge. Shared with the DTC
  // Assistant chat feature's daily preview/monthly+daily full-report
  // allowance — see src/lib/ai-diagnostics/usage.ts.
  const accessLevel = await recordAiDiagnosticUsage({ userId, requestId: caseId, feature: "scan_report", plan });
  await recordEvent("ai_diagnosis_started", { userId, metadata: { plan, accessLevel } });

  const admin = createAdminClient();
  const [
    { data: caseRow, error: caseError },
    { data: extraction, error: extractionError },
    { data: dtcRecords, error: dtcError },
    { data: systems, error: systemsError },
  ] = await Promise.all([
    admin.from("scan_cases").select("*").eq("id", caseId).single(),
    admin.from("scan_extractions").select("*").eq("case_id", caseId).maybeSingle(),
    admin.from("scan_dtc_records").select("*").eq("case_id", caseId),
    admin.from("scan_systems").select("*").eq("case_id", caseId),
  ]);
  if (caseError) throw caseError;
  if (extractionError) throw extractionError;
  if (dtcError) throw dtcError;
  if (systemsError) throw systemsError;

  const input = buildCanonicalDiagnosticInput(
    caseRow as ScanCase,
    (extraction as ScanExtraction | null) ?? null,
    (dtcRecords as ScanDtcRecord[]) ?? [],
    (systems as ScanSystem[]) ?? [],
  );

  // Patterns are deterministic (never derived from the AI) and persisted
  // BEFORE the AI is ever called — see docs/SCAN_PATTERN_AND_PRIORITY_ENGINE.md
  // "canonical structured data must be stored before AI analysis."
  const canonicalScanForPatterns = buildCanonicalVehicleScan(
    caseRow as ScanCase,
    (extraction as ScanExtraction | null) ?? null,
    (dtcRecords as ScanDtcRecord[]) ?? [],
    (systems as ScanSystem[]) ?? [],
  );
  const detectedPatterns = detectPatterns(canonicalScanForPatterns);
  await admin.from("scan_patterns").delete().eq("case_id", caseId);
  if (detectedPatterns.length > 0) {
    await admin.from("scan_patterns").insert(
      detectedPatterns.map((p) => ({
        case_id: caseId,
        pattern_type: p.patternType,
        severity: p.severity,
        evidence: p.evidence,
        affected_modules: p.affectedModules,
        rule_version: p.ruleVersion,
      })),
    );
  }

  // Pre-flight cost estimate + hard-ceiling guard, run AFTER the
  // report-count slot is reserved above but BEFORE the case is even
  // transitioned to "analyzing" or the AI provider is called — a request
  // estimated over COST_GUARDS.hardCeilingUsd is rejected here, leaving
  // the case in its original status, exactly like the "usage limit
  // exceeded" path above. Estimation assumes the production Anthropic
  // provider's configured model/token budget (the only provider wired in
  // today) rather than the `provider` argument's own id, since the actual
  // model isn't known until after the call returns.
  const estimatedInputTokens = Math.ceil(JSON.stringify(input).length / 4);
  const costEstimate = estimateCostMicros({
    modelId: SCAN_REPORT_MODEL_ID,
    estimatedInputTokens,
    estimatedOutputTokens: SCAN_REPORT_MAX_TOKENS,
  });
  try {
    guardCostCeiling(costEstimate);
  } catch (err) {
    if (err instanceof CostCeilingExceededError) {
      await releaseAiDiagnosticUsage(userId, caseId).catch((releaseErr) =>
        console.error("[scan-diagnostics] failed to release usage reservation after cost-ceiling rejection", releaseErr),
      );
      await recordAiDiagnosticRun({
        userId,
        requestId: caseId,
        feature: "scan_report",
        plan,
        providerId: provider.id,
        modelId: SCAN_REPORT_MODEL_ID,
        status: "failed",
        accessLevelRequested: accessLevel,
        errorMessage: err.message,
        diagnosticCaseId: caseId,
        estimatedTotalCostMicros: costEstimate.totalCostMicros,
      });
      await recordEvent("ai_diagnosis_failed", { userId, metadata: { plan, reason: "cost_ceiling_exceeded" } });
    }
    throw err;
  }

  await transitionCaseStatus(caseId, ["ready_for_analysis", "failed"], "analyzing");

  const requestStartedAt = Date.now();
  let providerResult: DiagnosticAIProviderResult;
  // Orchestration is entirely opt-in (AI_ORCHESTRATOR_ENABLED, default
  // false) — when off, this calls provider.runDiagnosis(input) directly,
  // exactly as before this feature existed. The orchestrated branch below
  // returns a result in the SAME shape, so every line after this try/catch
  // (safety review, confidence, persistence) is completely unaware of which
  // path ran. See docs/MULTI_MODEL_ORCHESTRATOR.md.
  let orchestrationOutcome: Awaited<ReturnType<typeof runOrchestratedDiagnosis>> | null = null;
  try {
    if (env.aiOrchestratorEnabled()) {
      orchestrationOutcome = await runOrchestratedDiagnosis(caseId, userId, input);
      providerResult = orchestrationOutcome.result;
    } else {
      providerResult = await provider.runDiagnosis(input);
    }
  } catch (err) {
    console.error("[scan-diagnostics] AI provider call failed", err);

    // Release the reserved usage slot — a failed generation must never
    // consume a free preview or a paid report allowance. A subsequent
    // retry re-enters at the top of this function and reserves fresh.
    await releaseAiDiagnosticUsage(userId, caseId).catch((releaseErr) =>
      console.error("[scan-diagnostics] failed to release usage reservation after provider failure", releaseErr),
    );

    const isValidationFailure = err instanceof AiResponseValidationError;
    const isBudgetHardStop = err instanceof BudgetHardStopError;
    // The orchestrator may have failed on a different provider than the
    // `provider` argument (e.g. OpenAI-as-primary) before ever producing a
    // result — "orchestrator" avoids misattributing that failure to
    // whichever provider instance the route happened to pass in.
    const failedProviderId = env.aiOrchestratorEnabled() ? "orchestrator" : provider.id;

    await admin.from("scan_ai_runs").insert({
      case_id: caseId,
      provider_id: failedProviderId,
      model_id: "unknown",
      status: "failed",
      error_message: isValidationFailure
        ? "AI response failed validation."
        : isBudgetHardStop
          ? "AI diagnostic budget limit reached."
          : "AI provider call failed.",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });
    await recordAiDiagnosticRun({
      userId,
      requestId: caseId,
      feature: "scan_report",
      plan,
      providerId: failedProviderId,
      modelId: SCAN_REPORT_MODEL_ID,
      status: "failed",
      accessLevelRequested: accessLevel,
      errorMessage: isValidationFailure
        ? "AI response failed validation."
        : isBudgetHardStop
          ? "AI diagnostic budget limit reached."
          : "AI provider call failed.",
      diagnosticCaseId: caseId,
      latencyMs: Date.now() - requestStartedAt,
    });
    await recordEvent("ai_diagnosis_failed", {
      userId,
      metadata: {
        plan,
        reason: isValidationFailure ? "validation_failure" : isBudgetHardStop ? "budget_hard_stop" : "provider_error",
      },
    });

    // Deterministic DTC lookup and existing case/extraction data remain
    // available regardless of this failure — per Phase 8's "do not take the
    // website offline" requirement, this only ever fails THIS case's AI
    // generation, never the app itself.
    const failedCase = await transitionCaseStatus(caseId, "analyzing", "failed", {
      error_message: isBudgetHardStop
        ? "AI diagnostic generation is temporarily paused. Basic DTC lookup remains available."
        : "AI analysis failed. Please try again.",
    });

    throw new ScanAnalysisFailedError(
      failedCase,
      isValidationFailure ? { code: err.code, retryable: err.retryable } : undefined,
    );
  }

  const safety = runSafetyReview(providerResult.output, input);
  const confidence = computeConfidence([providerResult], input, safety);

  if (orchestrationOutcome) {
    await persistRoutingDecision({
      caseId,
      primaryProviderId: providerResult.providerId,
      reviewerProviderId: orchestrationOutcome.reviewerProviderId,
      routing: orchestrationOutcome.routing,
      budgetState: orchestrationOutcome.budgetState,
      budgetReasons: orchestrationOutcome.budgetReasons,
      confidenceBefore: confidence.internalScore,
      confidenceAfter: confidence.internalScore,
    });
  }

  const { data: aiRun, error: aiRunError } = await admin
    .from("scan_ai_runs")
    .insert({
      case_id: caseId,
      provider_id: providerResult.providerId,
      model_id: providerResult.modelId,
      prompt_version: providerResult.promptVersion,
      status: "completed",
      output: providerResult.output,
      safety_review: safety,
      // Deprecated numeric field, kept for audit/debug only — see report.ts.
      confidence: confidence.internalScore,
      confidence_breakdown: { confidenceLevel: confidence.confidenceLevel, rationale: confidence.rationale },
      input_tokens: providerResult.tokens.input,
      output_tokens: providerResult.tokens.output,
      completed_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (aiRunError) throw aiRunError;

  const report = await assembleAndPersistReport(caseId, aiRun.id, providerResult, safety, confidence);
  const completedCase = await transitionCaseStatus(caseId, "analyzing", "completed");

  // Cost/observability log only — never gates anything, never exposed to
  // the customer. Computed from the provider's real reported token usage,
  // not the pre-flight estimate above (which only ever gates).
  const actualCost = computeActualCostMicros({
    modelId: providerResult.modelId,
    inputTokens: providerResult.tokens.input,
    outputTokens: providerResult.tokens.output,
  });
  await recordAiDiagnosticRun({
    userId,
    requestId: caseId,
    feature: "scan_report",
    plan,
    providerId: providerResult.providerId,
    modelId: providerResult.modelId,
    status: "completed",
    accessLevelRequested: accessLevel,
    inputTokens: providerResult.tokens.input,
    outputTokens: providerResult.tokens.output,
    diagnosticCaseId: caseId,
    reportId: report.id,
    creditsConsumed: DIAGNOSTIC_CREDIT_WEIGHTS.standardReport,
    estimatedInputCostMicros: actualCost.inputCostMicros,
    estimatedOutputCostMicros: actualCost.outputCostMicros,
    estimatedTotalCostMicros: actualCost.totalCostMicros,
    latencyMs: Date.now() - requestStartedAt,
  });
  await recordEvent("ai_diagnosis_completed", { userId, metadata: { plan, accessLevel } });

  return { case: completedCase, report };
}
