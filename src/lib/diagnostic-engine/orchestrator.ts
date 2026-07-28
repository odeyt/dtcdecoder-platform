// Diagnostic Engine orchestrator (docs/PHASE_2_ARCHITECTURE.md) — the one
// place that runs a full engine turn: User -> Diagnostic Intake -> Evidence
// Engine -> Probability Engine -> Question Engine -> AI provider -> Response
// Formatter -> User. Every other Phase 2 module (evidence/graph/probability/
// confidence/question/prompt-builder/response-formatter/test-planner/
// safety) is pure or narrowly persistence-focused; this is the seam that
// sequences them for a real case, gated behind the Phase 2 feature flags
// (all default OFF — see feature-flags.ts) so Phase 0/1's existing flows
// are completely unaffected until this is explicitly turned on.
//
// Phase 2.1 additions (docs/PHASE_2_1_INTEGRATION_AUDIT.md §4,
// docs/PHASE_2_1_OBSERVABILITY.md): entitlement enforcement via a
// dedicated turn-shaped usage ledger (diagnostic-engine/usage.ts, NOT the
// report-shaped ai-diagnostics/usage.ts — seeing why is in the audit doc),
// and structured, privacy-safe observability for every turn attempt
// (diagnostic-engine/observability.ts) — recorded for skipped and failed
// turns too, never only successful ones, so cost/usage is never silently
// unobserved.
import "server-only";
import { getCaseForOwner } from "@/lib/scan-diagnostics/cases";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCanonicalVehicleScan } from "@/lib/scan-diagnostics/canonical-scan";
import { SCAN_REPORT_MODEL_ID, SCAN_REPORT_MAX_TOKENS } from "@/lib/scan-diagnostics/ai/anthropic-provider";
import { estimateCostMicros, computeActualCostMicros, guardCostCeiling, microsToUsd } from "@/lib/ai-diagnostics/cost";
import { DIAGNOSTIC_ENGINE_FLAGS, type DiagnosticEngineRolloutTier } from "@/lib/diagnostic-engine/feature-flags";
import { getEvidenceForCase, insertEvidence, dedupeAgainstExisting, buildEvidenceFromCase } from "@/lib/diagnostic-engine/evidence";
import { getGraphForCase, saveGraph, buildEvidenceNodes, buildHypothesisNodesAndEdges, buildQuestionNode, mergeGraph } from "@/lib/diagnostic-engine/graph";
import { getQuestionsForCase, recordQuestion, selectNextQuestion } from "@/lib/diagnostic-engine/question";
import { getHypothesesForCase, saveHypotheses, buildRankedHypotheses } from "@/lib/diagnostic-engine/probability";
import { computeEngineConfidence } from "@/lib/diagnostic-engine/confidence";
import { buildDiagnosticPromptSections, renderDiagnosticPrompt } from "@/lib/diagnostic-engine/prompt-builder";
import { formatDiagnosticEngineResponse, type DiagnosticEngineResponse } from "@/lib/diagnostic-engine/response-formatter";
import { buildTestPlan } from "@/lib/diagnostic-engine/test-planner";
import { classifyDriveSafety } from "@/lib/diagnostic-engine/safety";
import { shouldSkipRedundantAiCall } from "@/lib/diagnostic-engine/cost-optimization";
import { recordDiagnosticEngineUsage, releaseDiagnosticEngineUsage } from "@/lib/diagnostic-engine/usage";
import { recordDiagnosticEngineRun, classifyFailure } from "@/lib/diagnostic-engine/observability";
import { resolveDiagnosticEngineAccess } from "@/lib/diagnostic-engine/entitlements";
import {
  isDiagnosticEngineKillSwitchActive,
  computeDiagnosticEngineBudgetState,
  assertDiagnosticEngineBudgetAllows,
  DiagnosticEngineKillSwitchError,
} from "@/lib/diagnostic-engine/budget-guard";
import type { DiagnosticAIProvider } from "@/lib/scan-diagnostics/ai/provider";
import type { DiagnosticGraph, PlannedTest, DriveSafetyClassification, RankedHypothesis } from "@/lib/diagnostic-engine/types";
import type { ScanCase, ScanExtraction, ScanDtcRecord, ScanSystem, SubscriptionPlan } from "@/lib/types";

export class DiagnosticEngineProviderUnsupportedError extends Error {
  constructor(providerId: string) {
    super(`Provider "${providerId}" does not support Diagnostic Engine turns.`);
    this.name = "DiagnosticEngineProviderUnsupportedError";
  }
}

export interface DiagnosticEngineTurnBilling {
  plan: SubscriptionPlan;
  email: string | null;
  rolloutTier: DiagnosticEngineRolloutTier;
  /** Client-generated per-attempt id — retrying the SAME turn with the same requestId never double-charges or double-calls the provider's usage ledger. */
  requestId: string;
}

export interface DiagnosticEngineTurnResult {
  response: DiagnosticEngineResponse | null;
  graph: DiagnosticGraph | null;
  // Current ranked-hypothesis snapshot regardless of whether THIS turn
  // generated a fresh one — case memory (spec item 9) must survive a page
  // refresh even on a turn that skipped the AI call (see
  // costOptimization.aiCallSkipped) or had the probability engine off.
  hypotheses: RankedHypothesis[];
  testPlan: PlannedTest[];
  // Never null (docs/DIAGNOSTIC_ENGINE_SAFETY_NULL_AUDIT.md) — computed
  // unconditionally from persisted evidence on every turn, independent of
  // whether the AI call ran, was skipped, or the module flag is off.
  safety: DriveSafetyClassification;
  evidenceCount: number;
  costOptimization: { aiCallSkipped: boolean };
}

// First turn only: the Evidence Engine has nothing to work from yet, so
// derive it deterministically from whatever the case already has (scan
// upload, quick DTC entry, or landing intake all populate the same
// scan_cases/scan_extractions/scan_dtc_records/scan_systems rows). Later
// turns skip this entirely — evidence then only grows via
// evidenceFromAnswer() as the Question Engine gets answers.
async function ensureInitialEvidence(caseId: string) {
  const existing = await getEvidenceForCase(caseId);
  if (existing.length > 0) return existing;

  const admin = createAdminClient();
  const [{ data: caseRow, error: caseError }, { data: extraction, error: extractionError }, { data: dtcRecords, error: dtcError }, { data: systems, error: systemsError }] =
    await Promise.all([
      admin.from("scan_cases").select("*").eq("id", caseId).single(),
      admin.from("scan_extractions").select("*").eq("case_id", caseId).maybeSingle(),
      admin.from("scan_dtc_records").select("*").eq("case_id", caseId),
      admin.from("scan_systems").select("*").eq("case_id", caseId),
    ]);
  if (caseError) throw caseError;
  if (extractionError) throw extractionError;
  if (dtcError) throw dtcError;
  if (systemsError) throw systemsError;

  const canonicalScan = buildCanonicalVehicleScan(
    caseRow as ScanCase,
    (extraction as ScanExtraction | null) ?? null,
    (dtcRecords as ScanDtcRecord[]) ?? [],
    (systems as ScanSystem[]) ?? [],
  );
  const candidates = buildEvidenceFromCase(caseRow as ScanCase, (extraction as ScanExtraction | null) ?? null, canonicalScan);
  const fresh = dedupeAgainstExisting(existing, candidates);
  if (fresh.length > 0) await insertEvidence(caseId, fresh);
  return getEvidenceForCase(caseId);
}

export async function runDiagnosticEngineTurn(
  userId: string,
  caseId: string,
  provider: DiagnosticAIProvider,
  billing: DiagnosticEngineTurnBilling,
): Promise<DiagnosticEngineTurnResult> {
  await getCaseForOwner(userId, caseId);

  const evidence = await ensureInitialEvidence(caseId);

  // Computed once, early, from evidence alone — the correct value for
  // every branch that never reaches a successful AI call (module
  // disabled, cost-optimization skip, budget/kill-switch block, provider
  // failure). Reassigned below only after a successful AI call, so its
  // AI-text signal can raise (never lower) this same value. Threaded into
  // every recordDiagnosticEngineRun call so
  // diagnostic_engine_runs.safety_classification is never left null
  // (docs/DIAGNOSTIC_ENGINE_SAFETY_NULL_AUDIT.md's observability
  // follow-up), and reused directly for the final return instead of
  // being recomputed a second time.
  let safety = classifyDriveSafety(evidence, []);

  let nextQuestion = null as ReturnType<typeof selectNextQuestion>;
  let persistedQuestion: Awaited<ReturnType<typeof recordQuestion>> | null = null;
  if (DIAGNOSTIC_ENGINE_FLAGS.questionEngineEnabled()) {
    const askedQuestions = await getQuestionsForCase(caseId);
    const askedFieldKeys = new Set(askedQuestions.map((q) => q.fieldKey));
    nextQuestion = selectNextQuestion(askedFieldKeys, evidence);
    if (nextQuestion) persistedQuestion = await recordQuestion(caseId, nextQuestion);
  }

  let hypotheses = await getHypothesesForCase(caseId);
  let aiOutput = null as Awaited<ReturnType<NonNullable<DiagnosticAIProvider["runDiagnosticEngineTurn"]>>>["output"] | null;
  let aiCallSkipped = false;

  if (DIAGNOSTIC_ENGINE_FLAGS.probabilityEngineEnabled()) {
    if (!provider.runDiagnosticEngineTurn) {
      throw new DiagnosticEngineProviderUnsupportedError(provider.id);
    }

    const graphForPrompt = DIAGNOSTIC_ENGINE_FLAGS.diagnosticGraphEnabled() ? await getGraphForCase(caseId) : null;

    // Cost optimization (docs/PROBABILITY_ENGINE.md#cost-optimization):
    // don't pay for a redundant generation — or consume the caller's
    // entitlement — when nothing has changed since the graph last
    // reflected this case's evidence. Only possible when the graph is
    // enabled, since that's the only place "what evidence did the last AI
    // call already see" is recorded.
    if (shouldSkipRedundantAiCall({ evidence, graph: graphForPrompt, hasExistingHypotheses: hypotheses.length > 0 })) {
      aiCallSkipped = true;
      await recordDiagnosticEngineRun({
        userId,
        caseId,
        requestId: billing.requestId,
        plan: billing.plan,
        rolloutTier: billing.rolloutTier,
        providerCalled: false,
        skipReason: "evidence_unchanged_since_graph",
        evidenceCount: evidence.length,
        hypothesisCount: hypotheses.length,
        safetyClassification: safety.status,
        schemaValidationResult: "not_applicable",
        status: "skipped",
      });
    } else {
      const access = resolveDiagnosticEngineAccess(billing.email, billing.plan);

      const sections = buildDiagnosticPromptSections({ evidence, graph: graphForPrompt, hypotheses, nextQuestion });
      const prompt = renderDiagnosticPrompt(sections);

      const estimatedInputTokens = Math.ceil(prompt.length / 4);
      const estimate = estimateCostMicros({
        modelId: SCAN_REPORT_MODEL_ID,
        estimatedInputTokens,
        estimatedOutputTokens: SCAN_REPORT_MAX_TOKENS,
      });
      // Runs before the entitlement slot is reserved — a request too large
      // to safely run at all shouldn't cost the caller a turn from their
      // allowance for being rejected.
      guardCostCeiling(estimate);

      // Phase 2.2 Steps 6-7 (docs/PHASE_2_2_COST_GUARDRAILS.md): aggregate
      // global/user/internal budget check, on top of the existing
      // single-request cost ceiling above. Checked BEFORE the turn-count
      // usage slot is reserved — a request blocked here never consumes a
      // slot from the caller's own allowance. The kill switch is checked
      // first since it should stop every call immediately regardless of
      // remaining budget on any dimension.
      try {
        if (isDiagnosticEngineKillSwitchActive()) {
          throw new DiagnosticEngineKillSwitchError();
        }
        const budgetStatus = await computeDiagnosticEngineBudgetState(userId, access.isInternal);
        assertDiagnosticEngineBudgetAllows(budgetStatus);
      } catch (err) {
        const failureCategory = classifyFailure(err);
        await recordDiagnosticEngineRun({
          userId,
          caseId,
          requestId: billing.requestId,
          plan: billing.plan,
          rolloutTier: billing.rolloutTier,
          isInternal: access.isInternal,
          providerCalled: false,
          evidenceCount: evidence.length,
          hypothesisCount: hypotheses.length,
          safetyClassification: safety.status,
          estimatedCostUsdPreflight: microsToUsd(estimate.totalCostMicros),
          schemaValidationResult: "not_applicable",
          status: "failed",
          failureCategory,
          blockedBudgetScope: err instanceof Error && "blockedScope" in err ? ((err as { blockedScope?: string | null }).blockedScope ?? null) : null,
        });
        throw err;
      }

      // Entitlement enforcement (docs/PHASE_2_1_INTEGRATION_AUDIT.md §4) —
      // reserved BEFORE the provider call, released on failure below, same
      // reserve/release shape as every other AI-calling feature in this
      // app. Never bypassed for internal testers (they still consume a
      // recorded — just uncapped — slot, so usage is never silently
      // unobserved for them either).
      await recordDiagnosticEngineUsage({
        userId,
        email: billing.email,
        requestId: billing.requestId,
        feature: "diagnostic_engine_turn",
        plan: billing.plan,
      });

      const startedAt = Date.now();
      try {
        const result = await provider.runDiagnosticEngineTurn(prompt);
        const latencyMs = Date.now() - startedAt;
        aiOutput = result.output;
        hypotheses = await saveHypotheses(caseId, buildRankedHypotheses(aiOutput, evidence));
        // Recompute now that aiOutput exists — the AI-text signal can only
        // raise this above the evidence-only floor already assigned above,
        // never lower it (severity precedence, safety.ts).
        safety = classifyDriveSafety(evidence, aiOutput.safetyWarnings);

        const actualCost = computeActualCostMicros({
          modelId: SCAN_REPORT_MODEL_ID,
          inputTokens: result.tokens.input,
          outputTokens: result.tokens.output,
        });

        await recordDiagnosticEngineRun({
          userId,
          caseId,
          requestId: billing.requestId,
          plan: billing.plan,
          rolloutTier: billing.rolloutTier,
          isInternal: access.isInternal,
          providerId: result.providerId,
          modelId: result.modelId,
          providerCalled: true,
          promptCacheStatus: "unknown", // provider result doesn't carry cache token counts yet — see docs/PHASE_2_1_OBSERVABILITY.md
          inputTokens: result.tokens.input,
          outputTokens: result.tokens.output,
          estimatedCostUsdPreflight: microsToUsd(estimate.totalCostMicros),
          estimatedCostUsd: microsToUsd(actualCost.totalCostMicros),
          latencyMs,
          evidenceCount: evidence.length,
          hypothesisCount: hypotheses.length,
          confidenceBand: hypotheses[0]?.confidenceLevel ?? null,
          safetyClassification: safety.status,
          schemaValidationResult: "valid",
          status: "completed",
        });
      } catch (err) {
        // Never invent a completed diagnosis after a failed provider call
        // (docs/PHASE_2_1_INTEGRATION_AUDIT.md Step 9) — aiOutput/hypotheses
        // stay at whatever they were before this call, so the response
        // built below reflects only real, previously-persisted state.
        await releaseDiagnosticEngineUsage(userId, billing.requestId);
        const failureCategory = classifyFailure(err);
        await recordDiagnosticEngineRun({
          userId,
          caseId,
          requestId: billing.requestId,
          plan: billing.plan,
          rolloutTier: billing.rolloutTier,
          isInternal: access.isInternal,
          providerCalled: true,
          estimatedCostUsdPreflight: microsToUsd(estimate.totalCostMicros),
          evidenceCount: evidence.length,
          hypothesisCount: hypotheses.length,
          safetyClassification: safety.status,
          schemaValidationResult: failureCategory === "invalid_structured_response" ? "invalid" : "not_applicable",
          status: "failed",
          failureCategory,
        });
        throw err;
      }
    }
  }

  let graph: DiagnosticGraph | null = null;
  if (DIAGNOSTIC_ENGINE_FLAGS.diagnosticGraphEnabled()) {
    const existingGraph = await getGraphForCase(caseId);
    const evidenceNodes = buildEvidenceNodes(evidence);
    const { nodes: hypothesisNodes, edges: hypothesisEdges } = buildHypothesisNodesAndEdges(hypotheses);
    const questionNodes = persistedQuestion ? [buildQuestionNode(persistedQuestion)] : [];
    const merged = mergeGraph(existingGraph ?? { nodes: [], edges: [] }, {
      nodes: [...evidenceNodes, ...hypothesisNodes, ...questionNodes],
      edges: hypothesisEdges,
    });
    graph = await saveGraph(caseId, merged.nodes, merged.edges, existingGraph?.version ?? null);
  }

  const confidence = DIAGNOSTIC_ENGINE_FLAGS.confidenceEngineEnabled()
    ? computeEngineConfidence(hypotheses, evidence)
    : computeEngineConfidence([], []);

  const testPlan =
    DIAGNOSTIC_ENGINE_FLAGS.testPlannerEnabled() && aiOutput ? buildTestPlan(aiOutput, hypotheses) : [];

  // `safety` was already computed above (evidence-only floor assigned near
  // the top, reassigned with the AI-text signal after a successful call) —
  // reused here rather than recomputed, and the same value already flowed
  // into every recordDiagnosticEngineRun call this turn touched.

  const response = aiOutput
    ? formatDiagnosticEngineResponse({ output: aiOutput, evidence, hypotheses, confidence, nextQuestion: persistedQuestion })
    : null;

  return {
    response,
    graph,
    hypotheses,
    testPlan,
    safety,
    evidenceCount: evidence.length,
    costOptimization: { aiCallSkipped },
  };
}
