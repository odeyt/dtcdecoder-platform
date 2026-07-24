import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { redactBlockedContent, type SafetyReviewResult } from "@/lib/scan-diagnostics/safety-rules";
import type { ConfidenceResult } from "@/lib/scan-diagnostics/confidence";
import type { DiagnosticAIProviderResult } from "@/lib/scan-diagnostics/ai/provider";
import type { ScanReport } from "@/lib/types";

// Upserts on the unique case_id index (scan_reports) — re-analyzing a case
// overwrites its previous report rather than accumulating history.
export async function assembleAndPersistReport(
  caseId: string,
  aiRunId: string,
  providerResult: DiagnosticAIProviderResult,
  safety: SafetyReviewResult,
  confidence: ConfidenceResult,
): Promise<ScanReport> {
  const redacted = redactBlockedContent(providerResult.output, safety.findings);

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("scan_reports")
    .upsert(
      {
        case_id: caseId,
        ai_run_id: aiRunId,
        ranked_causes: redacted.rankedCauses,
        recommended_tests: redacted.recommendedTests,
        safety_warnings: safety.findings,
        missing_information: redacted.missingInformation,
        // Deprecated numeric field — kept populated for audit/debug
        // continuity only; confidence_level is the field the UI and API
        // actually surface. See docs/DIAGNOSTIC_SCHEMA_V2.md.
        confidence: confidence.internalScore,
        confidence_level: confidence.confidenceLevel,
        confidence_rationale: confidence.rationale,
        schema_version: "2.0",
        generated_at: new Date().toISOString(),
      },
      { onConflict: "case_id" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
