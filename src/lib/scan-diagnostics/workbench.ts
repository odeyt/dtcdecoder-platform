import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCaseForOwner } from "@/lib/scan-diagnostics/cases";
import {
  InvalidCaseStatusError,
  InvalidReportIndexError,
  ScanCaseNotFoundError,
} from "@/lib/scan-diagnostics/api-errors";
import type {
  CauseStatusInput,
  CreateNoteInput,
  TestProgressInput,
  UpdateNoteInput,
  VerificationInput,
} from "@/lib/scan-diagnostics/schemas";
import type {
  ScanCase,
  ScanCaseNote,
  ScanCaseVerification,
  ScanReport,
  ScanReportCauseStatus,
  ScanReportTestProgress,
} from "@/lib/types";

async function getCompletedReportForCase(caseId: string): Promise<ScanReport> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("scan_reports").select("*").eq("case_id", caseId).maybeSingle();
  if (error) throw error;
  if (!data) throw new InvalidCaseStatusError("This case doesn't have a completed report yet.");
  return data;
}

// --- Notes -----------------------------------------------------------------

export async function listNotes(userId: string, caseId: string): Promise<ScanCaseNote[]> {
  await getCaseForOwner(userId, caseId);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("scan_case_notes")
    .select("*")
    .eq("case_id", caseId)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createNote(userId: string, caseId: string, input: CreateNoteInput): Promise<ScanCaseNote> {
  await getCaseForOwner(userId, caseId);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("scan_case_notes")
    .insert({
      case_id: caseId,
      user_id: userId,
      category: input.category,
      body: input.body,
      pinned: input.pinned ?? false,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateNote(
  userId: string,
  caseId: string,
  noteId: string,
  input: UpdateNoteInput,
): Promise<ScanCaseNote> {
  await getCaseForOwner(userId, caseId);
  const supabase = createAdminClient();
  const patch: Record<string, unknown> = {};
  if (input.category !== undefined) patch.category = input.category;
  if (input.body !== undefined) patch.body = input.body;
  if (input.pinned !== undefined) patch.pinned = input.pinned;

  // .eq("case_id", caseId) here (not just .eq("id", noteId)) means a note
  // id that's real but belongs to a different case (impossible today since
  // notes aren't shared across cases, but cheap insurance) never matches.
  const { data, error } = await supabase
    .from("scan_case_notes")
    .update(patch)
    .eq("id", noteId)
    .eq("case_id", caseId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ScanCaseNotFoundError();
  return data;
}

export async function deleteNote(userId: string, caseId: string, noteId: string): Promise<void> {
  await getCaseForOwner(userId, caseId);
  const supabase = createAdminClient();
  const { error } = await supabase.from("scan_case_notes").delete().eq("id", noteId).eq("case_id", caseId);
  if (error) throw error;
}

// --- Test progress -----------------------------------------------------

export async function listTestProgress(userId: string, caseId: string): Promise<ScanReportTestProgress[]> {
  await getCaseForOwner(userId, caseId);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("scan_report_test_progress")
    .select("*")
    .eq("case_id", caseId)
    .order("test_index", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function upsertTestProgress(
  userId: string,
  caseId: string,
  testIndex: number,
  input: TestProgressInput,
): Promise<ScanReportTestProgress> {
  await getCaseForOwner(userId, caseId);
  const report = await getCompletedReportForCase(caseId);

  if (testIndex < 0 || testIndex >= report.recommended_tests.length) {
    throw new InvalidReportIndexError("This test does not exist on this report.");
  }

  const supabase = createAdminClient();
  const patch: Record<string, unknown> = { case_id: caseId, report_id: report.id, test_index: testIndex };
  if (input.completed !== undefined) {
    patch.completed = input.completed;
    patch.completed_at = input.completed ? new Date().toISOString() : null;
  }
  if (input.outcome !== undefined) patch.outcome = input.outcome;
  if (input.actualResult !== undefined) patch.actual_result = input.actualResult;
  if (input.technicianNote !== undefined) patch.technician_note = input.technicianNote;

  const { data, error } = await supabase
    .from("scan_report_test_progress")
    .upsert(patch, { onConflict: "case_id,test_index" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

// --- Cause status --------------------------------------------------------

export async function listCauseStatus(userId: string, caseId: string): Promise<ScanReportCauseStatus[]> {
  await getCaseForOwner(userId, caseId);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("scan_report_cause_status")
    .select("*")
    .eq("case_id", caseId)
    .order("cause_index", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function upsertCauseStatus(
  userId: string,
  caseId: string,
  causeIndex: number,
  input: CauseStatusInput,
): Promise<ScanReportCauseStatus> {
  await getCaseForOwner(userId, caseId);
  const report = await getCompletedReportForCase(caseId);

  if (causeIndex < 0 || causeIndex >= report.ranked_causes.length) {
    throw new InvalidReportIndexError("This cause does not exist on this report.");
  }

  const supabase = createAdminClient();
  const patch: Record<string, unknown> = { case_id: caseId, report_id: report.id, cause_index: causeIndex };
  if (input.status !== undefined) patch.status = input.status;
  if (input.reviewed !== undefined) patch.reviewed = input.reviewed;

  const { data, error } = await supabase
    .from("scan_report_cause_status")
    .upsert(patch, { onConflict: "case_id,cause_index" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

// --- Verification checklist ------------------------------------------------

const VERIFICATION_FIELD_MAP: Record<keyof VerificationInput, string> = {
  concernResolved: "concern_resolved",
  dtcsCleared: "dtcs_cleared",
  dtcsDidNotReturn: "dtcs_did_not_return",
  calibrationCompleted: "calibration_completed",
  roadTestCompleted: "road_test_completed",
  noNewWarningLights: "no_new_warning_lights",
  postRepairScanReviewed: "post_repair_scan_reviewed",
  customerNotesRecorded: "customer_notes_recorded",
};

export async function getVerification(userId: string, caseId: string): Promise<ScanCaseVerification | null> {
  await getCaseForOwner(userId, caseId);
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("scan_case_verification").select("*").eq("case_id", caseId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertVerification(
  userId: string,
  caseId: string,
  input: VerificationInput,
): Promise<ScanCaseVerification> {
  await getCaseForOwner(userId, caseId);
  const supabase = createAdminClient();

  const patch: Record<string, unknown> = { case_id: caseId };
  for (const [key, column] of Object.entries(VERIFICATION_FIELD_MAP) as [keyof VerificationInput, string][]) {
    if (input[key] !== undefined) patch[column] = input[key];
  }

  const { data, error } = await supabase
    .from("scan_case_verification")
    .upsert(patch, { onConflict: "case_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

// --- Completion summary + mark-complete -------------------------------

export interface CompletionSummary {
  totalTests: number;
  completedTests: number;
  openTests: number;
  failedTests: number;
  totalCauses: number;
  unresolvedCauses: number;
  verificationTotal: number;
  verificationCompleted: number;
  readyToComplete: boolean;
}

// Read-only — used both to render the pre-completion summary and to
// server-side-validate a completion request (never trust a client claim
// that everything's done).
export async function getCompletionSummary(userId: string, caseId: string): Promise<CompletionSummary> {
  await getCaseForOwner(userId, caseId);
  const report = await getCompletedReportForCase(caseId);
  const [tests, causes, verification] = await Promise.all([
    listTestProgress(userId, caseId),
    listCauseStatus(userId, caseId),
    getVerification(userId, caseId),
  ]);

  const totalTests = report.recommended_tests.length;
  const completedTests = tests.filter((t) => t.completed).length;
  const failedTests = tests.filter((t) => t.outcome === "fail").length;

  const totalCauses = report.ranked_causes.length;
  const unresolvedCauses = totalCauses - causes.filter((c) => c.status === "confirmed" || c.status === "ruled_out").length;

  const verificationFields = Object.values(VERIFICATION_FIELD_MAP);
  const verificationTotal = verificationFields.length;
  const verificationCompleted = verification
    ? verificationFields.filter((column) => Boolean((verification as unknown as Record<string, unknown>)[column])).length
    : 0;

  return {
    totalTests,
    completedTests,
    openTests: totalTests - completedTests,
    failedTests,
    totalCauses,
    unresolvedCauses,
    verificationTotal,
    verificationCompleted,
    // Deliberately advisory, not a hard block — the brief asks to "summarize
    // before completion," not to prevent a technician from closing a case
    // with intentionally-skipped steps (e.g. a case where only some tests
    // were ever relevant). The UI surfaces this; it doesn't gate the action.
    readyToComplete: completedTests === totalTests && verificationCompleted === verificationTotal,
  };
}

export async function markCaseComplete(userId: string, caseId: string): Promise<ScanCase> {
  await getCaseForOwner(userId, caseId);
  // Confirms a report actually exists before allowing completion — a case
  // that never finished analysis has nothing to "complete."
  await getCompletedReportForCase(caseId);

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("scan_cases")
    .update({ technician_completed_at: new Date().toISOString(), technician_completed_by: userId })
    .eq("id", caseId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
