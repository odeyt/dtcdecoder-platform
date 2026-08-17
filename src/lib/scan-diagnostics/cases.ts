import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ScanCaseNotFoundError, InvalidCaseStatusError } from "@/lib/scan-diagnostics/api-errors";
import type { ExistingVinCase } from "@/lib/scan-diagnostics/api-errors";
import type { CaseInfoInput, QuickDiagnosticCaseInput } from "@/lib/scan-diagnostics/schemas";
import type {
  ScanCase,
  ScanCaseFile,
  ScanCaseStatus,
  ScanDtcRecord,
  ScanExtraction,
  ScanPattern,
  ScanReport,
  ScanSystem,
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
      report_language: info.reportLanguage ?? "en",
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
      // The customer's stated complaint gets its own real column, same as
      // the file-upload intake path — it must never be conflated with
      // scan-tool notes or freeze-frame notes, which are separate pieces
      // of evidence.
      complaint: input.complaint ?? null,
      symptoms: input.symptoms ?? [],
      mileage: null,
      recent_repairs: input.repairHistory ?? null,
      battery_condition: null,
      // scan_cases has no dedicated columns for free-text scan-tool/
      // freeze-frame notes, so both are preserved here, clearly labeled so
      // they stay distinguishable from each other and from the complaint —
      // never silently dropped, never merged into the complaint field.
      technician_notes:
        [
          input.freezeFrameNotes ? `Freeze-frame notes: ${input.freezeFrameNotes}` : null,
          input.scanToolNotes ? `Scan-tool notes: ${input.scanToolNotes}` : null,
        ]
          .filter((s): s is string => Boolean(s))
          .join("\n\n") || null,
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

// VIN lives on scan_extractions (one row per case), not scan_cases itself —
// a separate lookup, same pattern as getCaseDetail's parallel per-table
// queries, rather than a nested PostgREST join.
export async function listVinsForCaseIds(caseIds: string[]): Promise<Record<string, string | null>> {
  if (caseIds.length === 0) return {};
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("scan_extractions").select("case_id, vin").in("case_id", caseIds);
  if (error) throw error;
  const vinByCaseId: Record<string, string | null> = {};
  for (const row of data ?? []) vinByCaseId[row.case_id as string] = row.vin as string | null;
  return vinByCaseId;
}

// Duplicate-VIN charge-protection lookup — see DuplicateVinError. VIN
// comparison is trim+uppercase since scan_extractions.vin is free text (user-
// typed on the quick form, or parsed from an uploaded scan report) and was
// never normalized at write time. `excludeCaseId` omits the case the caller
// is currently analyzing (the analyze route's own case), so a case is never
// reported as a duplicate of itself. Cases with no scan_extractions row
// (e.g. still "draft") can never match, so they're excluded implicitly.
export async function findExistingCasesForVin(
  userId: string,
  vin: string,
  excludeCaseId?: string,
): Promise<ExistingVinCase[]> {
  const normalized = vin.trim().toUpperCase();
  if (!normalized) return [];

  const supabase = createAdminClient();
  const { data: cases, error: casesError } = await supabase
    .from("scan_cases")
    .select("id, status, complaint, created_at")
    .eq("user_id", userId);
  if (casesError) throw casesError;
  if (!cases || cases.length === 0) return [];

  const caseIds = cases.map((c) => c.id as string).filter((id) => id !== excludeCaseId);
  if (caseIds.length === 0) return [];

  const { data: extractions, error: extractionsError } = await supabase
    .from("scan_extractions")
    .select("case_id, vin")
    .in("case_id", caseIds);
  if (extractionsError) throw extractionsError;

  const matchingCaseIds = new Set(
    (extractions ?? [])
      .filter((e) => typeof e.vin === "string" && e.vin.trim().toUpperCase() === normalized)
      .map((e) => e.case_id as string),
  );
  if (matchingCaseIds.size === 0) return [];

  return cases
    .filter((c) => matchingCaseIds.has(c.id as string))
    .map((c) => ({
      id: c.id as string,
      status: c.status as ScanCaseStatus,
      complaint: c.complaint as string | null,
      createdAt: c.created_at as string,
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// Used only for the duplicate-VIN pre-flight check ahead of the analyze
// route's runScanAnalysis call — never returned to the client directly.
// Ownership is enforced separately (getCaseForOwner) before this is called.
export async function getVinForCase(caseId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("scan_extractions")
    .select("vin")
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) throw error;
  return (data?.vin as string | null) ?? null;
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
  systems: ScanSystem[];
  patterns: ScanPattern[];
  report: ScanReport | null;
}

// Shared by the GET /cases/[caseId] API route and the Server Component
// pages under src/app/(app)/diagnostics — one place owns this query shape
// rather than duplicating it in both.
export async function getCaseDetail(userId: string, caseId: string): Promise<ScanCaseDetail> {
  const scanCase = await getCaseForOwner(userId, caseId);

  const admin = createAdminClient();
  const [
    { data: files },
    { data: extraction },
    { data: dtcRecords },
    { data: systems },
    { data: patterns },
    { data: report },
  ] = await Promise.all([
    admin.from("scan_case_files").select("*").eq("case_id", caseId).order("uploaded_at", { ascending: false }),
    admin.from("scan_extractions").select("*").eq("case_id", caseId).maybeSingle(),
    admin.from("scan_dtc_records").select("*").eq("case_id", caseId).order("code"),
    admin.from("scan_systems").select("*").eq("case_id", caseId),
    admin.from("scan_patterns").select("*").eq("case_id", caseId),
    admin.from("scan_reports").select("*").eq("case_id", caseId).maybeSingle(),
  ]);

  return {
    case: scanCase,
    files: files ?? [],
    extraction: extraction ?? null,
    dtcRecords: dtcRecords ?? [],
    systems: systems ?? [],
    patterns: patterns ?? [],
    report: report ?? null,
  };
}
