// Analyze-stage orchestration, separated from the HTTP route so it can be
// unit-tested with a fake AI provider instead of hitting Anthropic. Owns
// the full sequence: usage gate -> status transition -> build canonical
// input -> run provider -> safety review -> confidence -> persist report
// -> final status transition.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCaseForOwner, transitionCaseStatus } from "@/lib/scan-diagnostics/cases";
import { consumeScanUsageSlot } from "@/lib/scan-diagnostics/usage";
import { buildCanonicalDiagnosticInput } from "@/lib/scan-diagnostics/canonical-input";
import { runSafetyReview } from "@/lib/scan-diagnostics/safety-rules";
import { computeConfidence } from "@/lib/scan-diagnostics/confidence";
import { assembleAndPersistReport } from "@/lib/scan-diagnostics/report";
import { ScanAnalysisFailedError } from "@/lib/scan-diagnostics/api-errors";
import type { DiagnosticAIProvider } from "@/lib/scan-diagnostics/ai/provider";
import type { ScanCase, ScanDtcRecord, ScanExtraction, ScanReport, SubscriptionPlan } from "@/lib/types";

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

  // Idempotent per case: a retry after a provider failure re-enters here,
  // finds the ledger row already present, and proceeds without a second
  // charge or a newly-blocked limit.
  await consumeScanUsageSlot(userId, caseId, plan);

  await transitionCaseStatus(caseId, ["ready_for_analysis", "failed"], "analyzing");

  const admin = createAdminClient();
  const [{ data: caseRow, error: caseError }, { data: extraction, error: extractionError }, { data: dtcRecords, error: dtcError }] =
    await Promise.all([
      admin.from("scan_cases").select("*").eq("id", caseId).single(),
      admin.from("scan_extractions").select("*").eq("case_id", caseId).maybeSingle(),
      admin.from("scan_dtc_records").select("*").eq("case_id", caseId),
    ]);
  if (caseError) throw caseError;
  if (extractionError) throw extractionError;
  if (dtcError) throw dtcError;

  const input = buildCanonicalDiagnosticInput(
    caseRow as ScanCase,
    (extraction as ScanExtraction | null) ?? null,
    (dtcRecords as ScanDtcRecord[]) ?? [],
  );

  let providerResult;
  try {
    providerResult = await provider.runDiagnosis(input);
  } catch (err) {
    console.error("[scan-diagnostics] AI provider call failed", err);

    await admin.from("scan_ai_runs").insert({
      case_id: caseId,
      provider_id: provider.id,
      model_id: "unknown",
      status: "failed",
      error_message: "AI provider call failed.",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });

    const failedCase = await transitionCaseStatus(caseId, "analyzing", "failed", {
      error_message: "AI analysis failed. Please try again.",
    });

    throw new ScanAnalysisFailedError(failedCase);
  }

  const safety = runSafetyReview(providerResult.output, input);
  const confidence = computeConfidence([providerResult], input, safety);

  const { data: aiRun, error: aiRunError } = await admin
    .from("scan_ai_runs")
    .insert({
      case_id: caseId,
      provider_id: providerResult.providerId,
      model_id: providerResult.modelId,
      status: "completed",
      output: providerResult.output,
      safety_review: safety,
      confidence: confidence.confidence,
      confidence_breakdown: { rationale: confidence.rationale },
      input_tokens: providerResult.tokens.input,
      output_tokens: providerResult.tokens.output,
      completed_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (aiRunError) throw aiRunError;

  const report = await assembleAndPersistReport(caseId, aiRun.id, providerResult, safety, confidence);
  const completedCase = await transitionCaseStatus(caseId, "analyzing", "completed");

  return { case: completedCase, report };
}
