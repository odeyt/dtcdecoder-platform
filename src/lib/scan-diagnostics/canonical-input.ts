// Builds the bounded AI input from persisted state: parser-extracted
// fields, with any user review corrections (scan_extractions.reviewed_fields)
// layered on top — never the raw uploaded file. Pure/synchronous so it's
// easy to unit-test independent of the database.
import type { ScanCase, ScanExtraction, ScanDtcRecord, ScanSystem } from "@/lib/types";
import type { CanonicalDiagnosticInput } from "@/lib/scan-diagnostics/schemas";
import { classifyDtcCategories } from "@/lib/scan-diagnostics/parsers/category-classification";
import { buildCanonicalVehicleScan } from "@/lib/scan-diagnostics/canonical-scan";
import { detectPatterns } from "@/lib/scan-diagnostics/patterns";
import { computeDiagnosticPriority } from "@/lib/scan-diagnostics/priority";

function reviewedOr<T>(reviewed: Record<string, unknown>, key: string, fallback: T | null): T | null {
  const value = reviewed[key];
  return value === undefined ? fallback : (value as T);
}

// A pathological/adversarial scan (hundreds of DTCs) could otherwise blow
// the model's context or cost budget if every single code were listed in
// full. Above this count, the per-code line-by-line prompt listing keeps
// every current, safety-relevant, network, battery, and bus-off code (the
// facts most likely to change the diagnosis) and drops only the lowest-
// priority remainder (reference-only/history codes with no special
// relevance) — recorded in `omittedFromPrompt`, never silently. The
// canonical DB record is never trimmed; only this one prompt's line list.
const MAX_FULL_DTC_LISTING = 150;

export function buildCanonicalDiagnosticInput(
  scanCase: ScanCase,
  extraction: ScanExtraction | null,
  dtcRecords: ScanDtcRecord[],
  systems: ScanSystem[] = [],
): CanonicalDiagnosticInput {
  const reviewed = extraction?.reviewed_fields ?? {};

  const canonicalScan = buildCanonicalVehicleScan(scanCase, extraction, dtcRecords, systems);
  const patterns = detectPatterns(canonicalScan);
  const priority = computeDiagnosticPriority(canonicalScan, patterns);

  let dtcs = dtcRecords;
  let omittedFromPrompt: CanonicalDiagnosticInput["omittedFromPrompt"] = null;
  if (dtcRecords.length > MAX_FULL_DTC_LISTING) {
    const alwaysKeepIds = new Set(
      canonicalScan.allDtcs
        .filter((d) => d.status === "current" || d.safetyRelevance || d.networkRelevance || d.batteryRelevance || d.busOffRelevance)
        .map((d) => d.id),
    );
    const kept: ScanDtcRecord[] = [];
    const omittedCodes: string[] = [];
    for (const record of dtcRecords) {
      if (alwaysKeepIds.has(record.id) || kept.length < MAX_FULL_DTC_LISTING) {
        kept.push(record);
      } else {
        omittedCodes.push(record.code);
      }
    }
    dtcs = kept;
    if (omittedCodes.length > 0) omittedFromPrompt = { count: omittedCodes.length, codes: omittedCodes };
  }

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
    // Canonical module fallback: the text/PDF parser tracks a DTC's owning
    // module heading (e.g. "BCM", "RFA") as `system_name`, not `module` —
    // only CSV/JSON sources ever populate the dedicated `module` column
    // directly. Coalescing once here means every downstream consumer (the
    // AI prompt, the rendered report) gets one reliable value regardless of
    // source format, instead of each one needing its own fallback.
    dtcs: dtcs.map((d) => ({
      module: d.module ?? d.system_name,
      code: d.code,
      status: d.status,
      descriptionRaw: d.description_raw,
    })),
    omittedFromPrompt,
    systems: canonicalScan.systems.map((s) => ({
      systemName: s.systemName,
      moduleName: s.moduleName,
      status: s.status,
      dtcCountReported: s.dtcCountReported,
      dtcCountExtracted: s.dtcCountExtracted,
      extractionComplete: s.extractionComplete,
    })),
    patterns: patterns.map((p) => ({
      patternType: p.patternType,
      severity: p.severity,
      name: p.name,
      evidence: p.evidence,
      affectedModules: p.affectedModules,
    })),
    priority: {
      fixFirstCodes: priority.fixFirst.map((d) => d.normalizedCode),
      diagnoseNextCodes: priority.diagnoseNext.map((d) => d.normalizedCode),
      monitorRecheckCodes: priority.monitorRecheck.map((d) => d.normalizedCode),
      historicalReferenceCodes: priority.historicalReference.map((d) => d.normalizedCode),
    },
    scanExtractionQuality: canonicalScan.extractionQuality,
    freezeFrame: extraction?.freeze_frame ?? [],
    liveData: extraction?.live_data ?? [],
    imageOnlyPdf: extraction?.image_only_pdf ?? false,
    extractionWarnings: extraction?.warnings ?? [],
    dtcCategoryClassification: classifyDtcCategories(dtcRecords, extraction?.modules ?? []),
  };
}
