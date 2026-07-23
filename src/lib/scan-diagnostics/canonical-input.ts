// Builds the bounded AI input from persisted state: parser-extracted
// fields, with any user review corrections (scan_extractions.reviewed_fields)
// layered on top — never the raw uploaded file. Pure/synchronous so it's
// easy to unit-test independent of the database.
import type { ScanCase, ScanExtraction, ScanDtcRecord } from "@/lib/types";
import type { CanonicalDiagnosticInput } from "@/lib/scan-diagnostics/schemas";

function reviewedOr<T>(reviewed: Record<string, unknown>, key: string, fallback: T | null): T | null {
  const value = reviewed[key];
  return value === undefined ? fallback : (value as T);
}

export function buildCanonicalDiagnosticInput(
  scanCase: ScanCase,
  extraction: ScanExtraction | null,
  dtcRecords: ScanDtcRecord[],
): CanonicalDiagnosticInput {
  const reviewed = extraction?.reviewed_fields ?? {};

  return {
    caseId: scanCase.id,
    vehicle: {
      vin: reviewedOr<string>(reviewed, "vin", extraction?.vin ?? null),
      year: reviewedOr<number>(reviewed, "modelYear", extraction?.model_year ?? null),
      make: reviewedOr<string>(reviewed, "make", extraction?.make ?? null),
      model: reviewedOr<string>(reviewed, "model", extraction?.model ?? null),
      engine: reviewedOr<string>(reviewed, "engine", extraction?.engine ?? null),
      mileage: reviewedOr<number>(
        reviewed,
        "odometerMiles",
        extraction?.odometer_miles ?? scanCase.mileage ?? null,
      ),
    },
    complaint: scanCase.complaint,
    symptoms: scanCase.symptoms,
    recentRepairs: scanCase.recent_repairs,
    batteryCondition: scanCase.battery_condition,
    technicianNotes: scanCase.technician_notes,
    modules: extraction?.modules ?? [],
    dtcs: dtcRecords.map((d) => ({
      module: d.module,
      code: d.code,
      status: d.status,
      descriptionRaw: d.description_raw,
    })),
    freezeFrame: extraction?.freeze_frame ?? [],
    liveData: extraction?.live_data ?? [],
    imageOnlyPdf: extraction?.image_only_pdf ?? false,
    extractionWarnings: extraction?.warnings ?? [],
  };
}
