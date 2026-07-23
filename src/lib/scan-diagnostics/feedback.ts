import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCaseForOwner } from "@/lib/scan-diagnostics/cases";
import { InvalidCaseStatusError } from "@/lib/scan-diagnostics/api-errors";
import type { FeedbackInput } from "@/lib/scan-diagnostics/schemas";
import type { ScanFeedback } from "@/lib/types";

// Upserts on the unique case_id index — resubmitting feedback for the same
// case corrects the earlier submission rather than creating a duplicate.
// Feedback submission itself is available on every plan (closing the loop
// on one's own case is low-cost); only the aggregated history VIEW below
// is plan-gated.
export async function submitFeedback(
  userId: string,
  caseId: string,
  input: FeedbackInput,
): Promise<ScanFeedback> {
  await getCaseForOwner(userId, caseId);

  const supabase = createAdminClient();
  const { data: report, error: reportError } = await supabase
    .from("scan_reports")
    .select("id")
    .eq("case_id", caseId)
    .maybeSingle();
  if (reportError) throw reportError;
  if (!report) {
    throw new InvalidCaseStatusError("This case doesn't have a completed report yet.");
  }

  const { data, error } = await supabase
    .from("scan_feedback")
    .upsert(
      {
        case_id: caseId,
        report_id: report.id,
        user_id: userId,
        diagnosis_was_correct: input.diagnosisWasCorrect ?? null,
        actual_root_cause: input.actualRootCause ?? null,
        confirmed_fix: input.confirmedFix ?? null,
        parts_replaced: input.partsReplaced ?? [],
        notes: input.notes ?? null,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "case_id" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function getFeedbackForCase(userId: string, caseId: string): Promise<ScanFeedback | null> {
  await getCaseForOwner(userId, caseId);

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("scan_feedback").select("*").eq("case_id", caseId).maybeSingle();
  if (error) throw error;
  return data;
}

// Callers must check canViewScanFeedbackHistory(plan) themselves before
// calling this — it does not re-check entitlement, matching the pattern
// used elsewhere (a disabled UI control is not enforcement, so the API
// route is what actually gates this).
export async function listFeedbackHistory(userId: string): Promise<ScanFeedback[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("scan_feedback")
    .select("*")
    .eq("user_id", userId)
    .order("submitted_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
