import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ScanCaseNotFoundError, InvalidCaseStatusError } from "@/lib/scan-diagnostics/api-errors";
import type { CaseInfoInput, QuickDiagnosticCaseInput } from "@/lib/scan-diagnostics/schemas";
import type {
  ScanCase,
  ScanCaseFile,
  ScanCaseStatus,
  ScanDtcRecord,
  ScanExtraction,
  ScanReport,
} from "@/lib/types";

export async function createCase(userId: string, info: CaseInfoInput): Promise<ScanCase> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("scan_cases")
    .insert({
      user_id: userId,
      status: "draft",
      complaint: info.complaint ?? null,
      symptoms: info.symptoms ?? [],
      mileage: info.mileage ?? null,
      recent_repairs: info.recentRepairs ?? null,
      battery_condition: info.batteryCondition ?? null,
      technician_notes: info.technicianNotes ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

// "Run Full AI Diagnosis" entry point from DTC search results — no file
// upload at all. Lands directly in "ready_for_analysis" (skipping
// uploaded/extracting/extraction_review, which only make sense for the
// file-based flow) with a manually-authored scan_extractions row (vehicle
// info the user typed in) and a scan_dtc_records row for the searched
// code. runScanAnalysis itself is completely unchanged — it only ever
// reads whatever's already persisted for a case, regardless of how it got
// there, so nothing about entitlement/quota/cost-guard enforcement is
// touched by this new entry point.
export async function createQuickDiagnosticCase(
  userId: string,
  input: QuickDiagnosticCaseInput,
): Promise<ScanCase> {
  const supabase = createAdminClient();

  const { data: scanCase, error: caseError } = await supabase
    .from("scan_cases")
    .insert({
      user_id: userId,
      status: "ready_for_analysis",
      complaint: input.scanToolNotes ?? null,
      symptoms: input.symptoms ?? [],
      mileage: null,
      recent_repairs: input.repairHistory ?? null,
      battery_condition: null,
      technician_notes: input.freezeFrameNotes ?? null,
      report_language: input.reportLanguage ?? "en",
    })
    .select("*")
    .single();
  if (caseError) throw caseError;

  const { error: extractionError } = await supabase.from("scan_extractions").insert({
    case_id: scanCase.id,
    file_id: null,
    parser_id: "manual-entry",
    parser_version: "1",
    vin: input.vin ?? null,
    make: input.make ?? null,
    model: input.model ?? null,
    model_year: input.modelYear ?? null,
    engine: input.engine ?? null,
    odometer_miles: null,
    modules: [],
    freeze_frame: [],
    live_data: [],
    image_only_pdf: false,
    warnings: [],
    reviewed_fields: {},
    reviewed_at: new Date().toISOString(),
  });
  if (extractionError) throw extractionError;

  const { error: dtcError } = await supabase.from("scan_dtc_records").insert({
    case_id: scanCase.id,
    module: input.module ?? null,
    code: input.dtcCode.trim().toUpperCase(),
    status: null,
    description_raw: null,
    source: "user_added",
  });
  if (dtcError) throw dtcError;

  return scanCase;
}

export async function listCasesForOwner(userId: string): Promise<ScanCase[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("scan_cases")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

// Ownership check baked in: a case that exists but belongs to someone else
// is indistinguishable from a case that doesn't exist, so no non-owner can
// learn anything about another user's case via this function.
export async function getCaseForOwner(userId: string, caseId: string): Promise<ScanCase> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("scan_cases")
    .select("*")
    .eq("id", caseId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ScanCaseNotFoundError();
  return data;
}

// Forward-only, guarded state transition: `WHERE status = from` means a
// concurrent request that already advanced this case causes this call to
// affect zero rows rather than silently overwriting a newer state.
export async function transitionCaseStatus(
  caseId: string,
  from: ScanCaseStatus | ScanCaseStatus[],
  to: ScanCaseStatus,
  extra?: Record<string, unknown>,
): Promise<ScanCase> {
  const supabase = createAdminClient();
  const fromStatuses = Array.isArray(from) ? from : [from];

  const { data, error } = await supabase
    .from("scan_cases")
    .update({ status: to, status_updated_at: new Date().toISOString(), ...extra })
    .eq("id", caseId)
    .in("status", fromStatuses)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new InvalidCaseStatusError(
      `Case is not in an expected state for this operation (needs one of: ${fromStatuses.join(", ")}).`,
    );
  }
  return data;
}

export interface ScanCaseDetail {
  case: ScanCase;
  files: ScanCaseFile[];
  extraction: ScanExtraction | null;
  dtcRecords: ScanDtcRecord[];
  report: ScanReport | null;
}

// Shared by the GET /cases/[caseId] API route and the Server Component
// pages under src/app/(app)/diagnostics — one place owns this query shape
// rather than duplicating it in both.
export async function getCaseDetail(userId: string, caseId: string): Promise<ScanCaseDetail> {
  const scanCase = await getCaseForOwner(userId, caseId);

  const admin = createAdminClient();
  const [{ data: files }, { data: extraction }, { data: dtcRecords }, { data: report }] = await Promise.all([
    admin.from("scan_case_files").select("*").eq("case_id", caseId).order("uploaded_at", { ascending: false }),
    admin.from("scan_extractions").select("*").eq("case_id", caseId).maybeSingle(),
    admin.from("scan_dtc_records").select("*").eq("case_id", caseId).order("code"),
    admin.from("scan_reports").select("*").eq("case_id", caseId).maybeSingle(),
  ]);

  return {
    case: scanCase,
    files: files ?? [],
    extraction: extraction ?? null,
    dtcRecords: dtcRecords ?? [],
    report: report ?? null,
  };
}
