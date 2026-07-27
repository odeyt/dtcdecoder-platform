import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ParsedScanReport } from "@/lib/scan-diagnostics/parsers/types";
import type { ExtractionReviewInput } from "@/lib/scan-diagnostics/schemas";
import { classifyDtcRelevance, isSafetyCriticalSystem } from "@/lib/scan-diagnostics/parsers/category-classification";
import type { ScanDtcStatus, ScanExtraction } from "@/lib/types";

const STATUS_ENUM: ScanDtcStatus[] = [
  "current",
  "history",
  "pending",
  "permanent",
  "intermittent",
  "stored",
  "reference_only",
  "unknown",
];

// Maps free-form status text from a scan-tool export to the DB's fixed
// enum. "reference_only" (the source's own "Generic Type DTC, reference
// Only" phrasing) is now recognized as its own value rather than being
// silently coerced away — see docs/FULL_SCAN_DATA_LOSS_AUDIT.md finding #9.
// Any OTHER non-empty status text that doesn't match a known pattern is
// "unknown" (a real status was stated, this app just doesn't recognize the
// wording) — distinct from null, which means no status text was present at
// all. Never guesses a specific value from unrecognized text.
export function normalizeStoredDtcStatus(raw: string | undefined): ScanDtcStatus | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (/reference\s*only/.test(lower)) return "reference_only";
  if (/current/.test(lower)) return "current";
  if (/hist/.test(lower)) return "history";
  if (/pend/.test(lower)) return "pending";
  if (/perm/.test(lower)) return "permanent";
  if (/intermitt/.test(lower)) return "intermittent";
  if (/stor|confirm|active/.test(lower)) return "stored";
  return STATUS_ENUM.includes(raw as ScanDtcStatus) ? (raw as ScanDtcStatus) : "unknown";
}

function dtcKey(module: string | null, systemName: string | null, code: string, status: string | null): string {
  return `${module ?? ""}|${systemName ?? ""}|${code}|${status ?? ""}`;
}

// Idempotent: re-running extraction on the same file upserts scan_extractions
// in place (unique on case_id) and only inserts DTC rows not already present
// for this case — a retry after a transient failure never duplicates rows.
export async function persistExtraction(
  caseId: string,
  fileId: string,
  parserId: string,
  parserVersion: string,
  parsed: ParsedScanReport,
): Promise<ScanExtraction> {
  const supabase = createAdminClient();

  const { data: extraction, error: extractionError } = await supabase
    .from("scan_extractions")
    .upsert(
      {
        case_id: caseId,
        file_id: fileId,
        parser_id: parserId,
        parser_version: parserVersion,
        vin: parsed.vin ?? null,
        make: parsed.make ?? null,
        model: parsed.model ?? null,
        model_year: parsed.modelYear ?? null,
        engine: parsed.engine ?? null,
        odometer_miles: parsed.odometerMiles ?? null,
        modules: parsed.modules,
        freeze_frame: parsed.freezeFrame,
        live_data: parsed.liveData,
        image_only_pdf: parsed.imageOnlyPdf,
        warnings: parsed.warnings,
        extracted_at: new Date().toISOString(),
        reviewed_fields: {},
        reviewed_at: null,
        scanner_brand: parsed.scannerBrand ?? null,
        diagnostic_application_version: parsed.diagnosticApplicationVersion ?? null,
        vehicle_software_version: parsed.vehicleSoftwareVersion ?? null,
        diagnostic_path: parsed.diagnosticPath ?? null,
        test_time: parsed.testTime ?? null,
        report_type: parsed.reportType ?? null,
        pages_expected: parsed.extractionQuality.pagesExpected ?? null,
        pages_parsed: parsed.extractionQuality.pagesParsed ?? null,
        systems_expected: parsed.extractionQuality.systemsExpected ?? null,
        systems_parsed: parsed.extractionQuality.systemsParsed ?? null,
        dtcs_expected: parsed.extractionQuality.dtcsExpected ?? null,
        dtcs_parsed: parsed.extractionQuality.dtcsParsed ?? null,
        extraction_truncated: parsed.extractionQuality.truncated,
        extraction_confidence: parsed.extractionQuality.confidence,
      },
      { onConflict: "case_id" },
    )
    .select("*")
    .single();

  if (extractionError) throw extractionError;

  if (parsed.dtcCodes.length > 0) {
    const { data: existingRows, error: existingError } = await supabase
      .from("scan_dtc_records")
      .select("module, system_name, code, status")
      .eq("case_id", caseId);
    if (existingError) throw existingError;

    const existingKeys = new Set(
      (existingRows ?? []).map((r) => dtcKey(r.module, r.system_name, r.code, r.status)),
    );

    const newRows = parsed.dtcCodes
      .map((dtc) => {
        const relevance = classifyDtcRelevance(dtc.code, dtc.descriptionRaw);
        return {
          case_id: caseId,
          module: dtc.module ?? null,
          code: dtc.code,
          status: normalizeStoredDtcStatus(dtc.status),
          description_raw: dtc.descriptionRaw ?? null,
          source: "extracted" as const,
          system_name: dtc.systemName ?? null,
          source_page: dtc.sourcePage ?? null,
          source_text: dtc.sourceText ?? null,
          safety_relevance: relevance.safetyRelevance || isSafetyCriticalSystem(dtc.systemName),
          network_relevance: relevance.networkRelevance,
          battery_relevance: relevance.batteryRelevance,
          bus_off_relevance: relevance.busOffRelevance,
        };
      })
      .filter((row) => !existingKeys.has(dtcKey(row.module, row.system_name, row.code, row.status)));

    if (newRows.length > 0) {
      const { error: insertError } = await supabase.from("scan_dtc_records").insert(newRows);
      if (insertError) throw insertError;
    }
  }

  if (parsed.systems.length > 0) {
    await supabase.from("scan_systems").delete().eq("case_id", caseId);
    const systemRows = parsed.systems.map((s) => ({
      case_id: caseId,
      system_name: s.systemName,
      module_name: s.moduleName ?? null,
      status: s.status,
      dtc_count_reported: s.dtcCountReported ?? null,
      dtc_count_extracted: s.dtcCountExtracted,
      extraction_complete: s.dtcCountReported === undefined || s.dtcCountExtracted >= s.dtcCountReported,
    }));
    const { error: systemsError } = await supabase.from("scan_systems").insert(systemRows);
    if (systemsError) throw systemsError;
  }

  return extraction;
}

// Layers user corrections on top of the extracted record without ever
// overwriting the original parser output — reviewed_fields keeps both
// available so the review UI can show "extracted" vs "user-entered"
// provenance side by side.
export async function applyExtractionReview(
  caseId: string,
  review: ExtractionReviewInput,
): Promise<void> {
  const supabase = createAdminClient();

  const fieldOverrides: Record<string, unknown> = {};
  for (const field of ["vin", "make", "model", "modelYear", "engine", "odometerMiles"] as const) {
    if (review[field] !== undefined) fieldOverrides[field] = review[field];
  }

  if (Object.keys(fieldOverrides).length > 0) {
    const { data: existing, error: fetchError } = await supabase
      .from("scan_extractions")
      .select("reviewed_fields")
      .eq("case_id", caseId)
      .maybeSingle();
    if (fetchError) throw fetchError;

    const merged = { ...(existing?.reviewed_fields ?? {}), ...fieldOverrides };
    const { error: updateError } = await supabase
      .from("scan_extractions")
      .update({ reviewed_fields: merged, reviewed_at: new Date().toISOString() })
      .eq("case_id", caseId);
    if (updateError) throw updateError;
  } else {
    const { error: touchError } = await supabase
      .from("scan_extractions")
      .update({ reviewed_at: new Date().toISOString() })
      .eq("case_id", caseId);
    if (touchError) throw touchError;
  }

  if (review.addDtcs && review.addDtcs.length > 0) {
    const rows = review.addDtcs.map((dtc) => ({
      case_id: caseId,
      module: dtc.module ?? null,
      code: dtc.code,
      status: normalizeStoredDtcStatus(dtc.status),
      description_raw: dtc.descriptionRaw ?? null,
      source: "user_added" as const,
    }));
    const { error } = await supabase.from("scan_dtc_records").insert(rows);
    if (error) throw error;
  }

  if (review.editDtcs && review.editDtcs.length > 0) {
    for (const edit of review.editDtcs) {
      const { data: existingRow, error: fetchError } = await supabase
        .from("scan_dtc_records")
        .select("source")
        .eq("id", edit.id)
        .eq("case_id", caseId)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!existingRow) continue;

      const nextSource = existingRow.source === "user_added" ? "user_added" : "user_edited";
      const updates: Record<string, unknown> = { source: nextSource };
      if (edit.module !== undefined) updates.module = edit.module;
      if (edit.code !== undefined) updates.code = edit.code;
      if (edit.status !== undefined) updates.status = normalizeStoredDtcStatus(edit.status);
      if (edit.descriptionRaw !== undefined) updates.description_raw = edit.descriptionRaw;

      const { error: updateError } = await supabase
        .from("scan_dtc_records")
        .update(updates)
        .eq("id", edit.id)
        .eq("case_id", caseId);
      if (updateError) throw updateError;
    }
  }

  if (review.removeDtcIds && review.removeDtcIds.length > 0) {
    const { error } = await supabase
      .from("scan_dtc_records")
      .delete()
      .eq("case_id", caseId)
      .in("id", review.removeDtcIds);
    if (error) throw error;
  }
}
