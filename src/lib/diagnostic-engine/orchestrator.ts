// Diagnostic Engine orchestrator (docs/PHASE_2_ARCHITECTURE.md) — the one
// place that runs a full engine turn: User -> Diagnostic Intake -> Evidence
// Engine -> Probability Engine -> Question Engine -> AI provider -> Response
// Formatter -> User. Every other Phase 2 module (evidence/graph/probability/
// confidence/question/prompt-builder/response-formatter/test-planner/
// safety) is pure or narrowly persistence-focused; this is the seam that
// sequences them for a real case, gated behind the Phase 2 feature flags
// (all default OFF — see feature-flags.ts) so Phase 1's existing scan-report
// flow is completely unaffected until this is explicitly turned on.
//
// NOT included here: the report-count usage ledger / entitlement limits
// used by the Phase 1 "full AI diagnostic report" feature
// (src/lib/ai-diagnostics/usage.ts). A Diagnostic Engine "turn" is a much
// smaller, more frequent unit of work than a full report (one per
// question answered, not one per case) — mapping it onto the existing
// per-report quota would either exhaust a technician's monthly allowance
// after a few questions or require a new pricing decision this phase's
// spec doesn't make. That mapping is left to Slice I ("cost optimization")
// or a deliberate product decision, not guessed at here. A raw per-call
// cost-ceiling safety net (guardCostCeiling) IS applied below, since that's
// a pure runaway-spend safety check, not a pricing decision.
import "server-only";
import { getCaseForOwner } from "@/lib/scan-diagnostics/cases";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCanonicalVehicleScan } from "@/lib/scan-diagnostics/canonical-scan";
import { SCAN_REPORT_MODEL_ID, SCAN_REPORT_MAX_TOKENS } from "@/lib/scan-diagnostics/ai/anthropic-provider";
import { estimateCostMicros, guardCostCeiling } from "@/lib/ai-diagnostics/cost";
import { DIAGNOSTIC_ENGINE_FLAGS } from "@/lib/diagnostic-engine/feature-flags";
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
import type { DiagnosticAIProvider } from "@/lib/scan-diagnostics/ai/provider";
import type { DiagnosticGraph, PlannedTest, DriveSafetyClassification, RankedHypothesis } from "@/lib/diagnostic-engine/types";
import type { ScanCase, ScanExtraction, ScanDtcRecord, ScanSystem } from "@/lib/types";

export class DiagnosticEngineProviderUnsupportedError extends Error {
  constructor(providerId: string) {
    super(`Provider "${providerId}" does not support Diagnostic Engine turns.`);
    this.name = "DiagnosticEngineProviderUnsupportedError";
  }
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
  safety: DriveSafetyClassification | null;
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
): Promise<DiagnosticEngineTurnResult> {
  await getCaseForOwner(userId, caseId);

  const evidence = await ensureInitialEvidence(caseId);

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

    // Cost optimization (docs/PHASE_2_ARCHITECTURE.md#cost-optimization):
    // don't pay for a redundant generation when nothing has changed since
    // the graph last reflected this case's evidence — reuse the existing
    // hypotheses instead. Only possible when the graph is enabled, since
    // that's the only place "what evidence did the last AI call already
    // see" is recorded.
    if (shouldSkipRedundantAiCall({ evidence, graph: graphForPrompt, hasExistingHypotheses: hypotheses.length > 0 })) {
      aiCallSkipped = true;
    } else {
      const sections = buildDiagnosticPromptSections({ evidence, graph: graphForPrompt, hypotheses, nextQuestion });
      const prompt = renderDiagnosticPrompt(sections);

      const estimate = estimateCostMicros({
        modelId: SCAN_REPORT_MODEL_ID,
        estimatedInputTokens: Math.ceil(prompt.length / 4),
        estimatedOutputTokens: SCAN_REPORT_MAX_TOKENS,
      });
      guardCostCeiling(estimate);

      const result = await provider.runDiagnosticEngineTurn(prompt);
      aiOutput = result.output;
      hypotheses = await saveHypotheses(caseId, buildRankedHypotheses(aiOutput, evidence));
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
    graph = await saveGraph(caseId, merged.nodes, merged.edges);
  }

  const confidence = DIAGNOSTIC_ENGINE_FLAGS.confidenceEngineEnabled()
    ? computeEngineConfidence(hypotheses, evidence)
    : computeEngineConfidence([], []);

  const testPlan =
    DIAGNOSTIC_ENGINE_FLAGS.testPlannerEnabled() && aiOutput ? buildTestPlan(aiOutput, hypotheses) : [];

  const safety = aiOutput ? classifyDriveSafety(evidence, aiOutput.safetyWarnings) : null;

  const response = aiOutput
    ? formatDiagnosticEngineResponse({ output: aiOutput, evidence, hypotheses, confidence, nextQuestion })
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
