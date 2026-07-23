import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ParsedScanReport } from "@/lib/scan-diagnostics/parsers/types";
import type { ExtractionReviewInput } from "@/lib/scan-diagnostics/schemas";
import type { ScanDtcStatus, ScanExtraction } from "@/lib/types";

const STATUS_ENUM: ScanDtcStatus[] = [
  "current",
  "history",
  "pending",
  "permanent",
  "intermittent",
  "stored",
];

// Maps free-form status text from a scan-tool export to the DB's fixed
// enum. Never guesses when the source text doesn't clearly match one of
// these — an unrecognized status is stored as null rather than a
// fabricated best guess.
function normalizeStoredDtcStatus(raw: string | undefined): ScanDtcStatus | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (/current/.test(lower)) return "current";
  if (/hist/.test(lower)) return "history";
  if (/pend/.test(lower)) return "pending";
  if (/perm/.test(lower)) return "permanent";
  if (/intermitt/.test(lower)) return "intermittent";
  if (/stor|confirm|active/.test(lower)) return "stored";
  return STATUS_ENUM.includes(raw as ScanDtcStatus) ? (raw as ScanDtcStatus) : null;
}

function dtcKey(module: string | null, code: string, status: string | null): string {
  return `${module ?? ""}|${code}|${status ?? ""}`;
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
      },
      { onConflict: "case_id" },
    )
    .select("*")
    .single();

  if (extractionError) throw extractionError;

  if (parsed.dtcCodes.length > 0) {
    const { data: existingRows, error: existingError } = await supabase
      .from("scan_dtc_records")
      .select("module, code, status")
      .eq("case_id", caseId);
    if (existingError) throw existingError;

    const existingKeys = new Set(
      (existingRows ?? []).map((r) => dtcKey(r.module, r.code, r.status)),
    );

    const newRows = parsed.dtcCodes
      .map((dtc) => ({
        case_id: caseId,
        module: dtc.module ?? null,
        code: dtc.code,
        status: normalizeStoredDtcStatus(dtc.status),
        description_raw: dtc.descriptionRaw ?? null,
        source: "extracted" as const,
      }))
      .filter((row) => !existingKeys.has(dtcKey(row.module, row.code, row.status)));

    if (newRows.length > 0) {
      const { error: insertError } = await supabase.from("scan_dtc_records").insert(newRows);
      if (insertError) throw insertError;
    }
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
