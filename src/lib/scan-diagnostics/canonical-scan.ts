// Canonical, read-only view over a case's persisted extraction — the
// single structured record the pattern engine, priority engine, AI-input
// builder, and admin inspection screen all read from. Deliberately NOT a
// new database shape: it's assembled from the existing scan_cases /
// scan_extractions / scan_dtc_records / scan_systems rows so there is one
// source of truth (the DB) and one typed read-model over it, rather than a
// second copy of the schema that could drift. See
// docs/FULL_SCAN_INGESTION_ARCHITECTURE.md.
//
// Per the "keep canonical structured data separate from AI-generated
// interpretation" rule: everything in this file is a deterministic
// projection of extracted facts. Nothing here is ever derived from an AI
// response.
import type { ScanCase, ScanDtcRecord, ScanExtraction, ScanSystem, ScanDtcStatus } from "@/lib/types";
import { classifyDtcCategories, findBusOffCodes } from "@/lib/scan-diagnostics/parsers/category-classification";
import type { DtcCategoryClassification } from "@/lib/scan-diagnostics/schemas";

export interface CanonicalVehicleScanSource {
  filename: string | null;
  scannerBrand: string | null;
  diagnosticApplicationVersion: string | null;
  vehicleSoftwareVersion: string | null;
  diagnosticPath: string | null;
  testTime: string | null;
  reportType: string | null;
}

export interface CanonicalVehicle {
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  engine: string | null;
  mileage: number | null;
}

export interface CanonicalDtc {
  id: string;
  rawCode: string;
  normalizedCode: string;
  description: string | null;
  status: ScanDtcStatus | "unknown_from_source" | null;
  systemName: string | null;
  sourcePage: number | null;
  sourceText: string | null;
  safetyRelevance: boolean;
  networkRelevance: boolean;
  batteryRelevance: boolean;
  busOffRelevance: boolean;
}

export interface CanonicalSystem {
  systemName: string;
  moduleName: string | null;
  status: "faulted" | "ok" | "unknown";
  dtcCountReported: number | null;
  dtcCountExtracted: number;
  extractionComplete: boolean;
  dtcs: CanonicalDtc[];
}

export interface CanonicalDerivedCategories {
  currentCodes: string[];
  historyCodes: string[];
  pendingCodes: string[];
  permanentCodes: string[];
  intermittentCodes: string[];
  referenceOnlyCodes: string[];
  unknownStatusCodes: string[];
  networkFaults: string[];
  lostCommunicationFaults: string[];
  batteryVoltageFaults: string[];
  busOffFaults: string[];
  safetySystemFaults: string[];
}

export interface CanonicalExtractionQuality {
  pagesExpected: number | null;
  pagesParsed: number | null;
  systemsExpected: number | null;
  systemsParsed: number | null;
  dtcsExpected: number | null;
  dtcsParsed: number | null;
  truncated: boolean;
  warnings: string[];
  confidence: "high" | "medium" | "low";
}

export interface CanonicalVehicleScan {
  caseId: string;
  source: CanonicalVehicleScanSource;
  vehicle: CanonicalVehicle;
  systems: CanonicalSystem[];
  allDtcs: CanonicalDtc[];
  derivedCategories: CanonicalDerivedCategories;
  // Kept for AI-prompt backward compatibility — the exact
  // DtcCategoryClassification shape the Anthropic provider prompt already
  // expects (pending/permanent/network/lost-comm/battery, found/not_stated).
  legacyCategoryClassification: DtcCategoryClassification;
  extractionQuality: CanonicalExtractionQuality;
}

function toCanonicalDtc(record: ScanDtcRecord): CanonicalDtc {
  return {
    id: record.id,
    rawCode: record.code,
    normalizedCode: record.code,
    description: record.description_raw,
    status: record.status,
    systemName: record.system_name,
    sourcePage: record.source_page,
    sourceText: record.source_text,
    safetyRelevance: record.safety_relevance,
    networkRelevance: record.network_relevance,
    batteryRelevance: record.battery_relevance,
    busOffRelevance: record.bus_off_relevance,
  };
}

export function buildCanonicalVehicleScan(
  scanCase: ScanCase,
  extraction: ScanExtraction | null,
  dtcRecords: ScanDtcRecord[],
  systems: ScanSystem[],
): CanonicalVehicleScan {
  const reviewed = extraction?.reviewed_fields ?? {};
  const reviewedOr = <T,>(key: string, fallback: T | null): T | null => {
    const value = reviewed[key];
    return value === undefined ? fallback : (value as T);
  };

  const allDtcs = dtcRecords.map(toCanonicalDtc);

  const dtcsBySystem = new Map<string, CanonicalDtc[]>();
  for (const dtc of allDtcs) {
    if (!dtc.systemName) continue;
    const list = dtcsBySystem.get(dtc.systemName) ?? [];
    list.push(dtc);
    dtcsBySystem.set(dtc.systemName, list);
  }

  const canonicalSystems: CanonicalSystem[] = systems.map((s) => ({
    systemName: s.system_name,
    moduleName: s.module_name,
    status: s.status,
    dtcCountReported: s.dtc_count_reported,
    dtcCountExtracted: s.dtc_count_extracted,
    extractionComplete: s.extraction_complete,
    dtcs: dtcsBySystem.get(s.system_name) ?? [],
  }));

  const byStatus = (status: ScanDtcStatus) => allDtcs.filter((d) => d.status === status).map((d) => d.normalizedCode);

  const derivedCategories: CanonicalDerivedCategories = {
    currentCodes: byStatus("current"),
    historyCodes: byStatus("history"),
    pendingCodes: byStatus("pending"),
    permanentCodes: byStatus("permanent"),
    intermittentCodes: byStatus("intermittent"),
    referenceOnlyCodes: byStatus("reference_only"),
    unknownStatusCodes: byStatus("unknown"),
    networkFaults: allDtcs.filter((d) => d.networkRelevance).map((d) => d.normalizedCode),
    lostCommunicationFaults: allDtcs
      .filter((d) => d.networkRelevance && /lost|missing|timeout|interrupt|cannot receive|frame/i.test(d.description ?? ""))
      .map((d) => d.normalizedCode),
    batteryVoltageFaults: allDtcs.filter((d) => d.batteryRelevance).map((d) => d.normalizedCode),
    busOffFaults: allDtcs.filter((d) => d.busOffRelevance).map((d) => d.normalizedCode),
    safetySystemFaults: allDtcs.filter((d) => d.safetyRelevance).map((d) => d.normalizedCode),
  };

  // findBusOffCodes reuses the same text pattern as the per-DTC
  // bus_off_relevance flag — kept for parity with any record whose
  // relevance flags predate migration 0028 (schema_version continuity).
  const busOffFromText = findBusOffCodes(dtcRecords);
  for (const code of busOffFromText) {
    if (!derivedCategories.busOffFaults.includes(code)) derivedCategories.busOffFaults.push(code);
  }

  return {
    caseId: scanCase.id,
    source: {
      filename: null,
      scannerBrand: extraction?.scanner_brand ?? null,
      diagnosticApplicationVersion: extraction?.diagnostic_application_version ?? null,
      vehicleSoftwareVersion: extraction?.vehicle_software_version ?? null,
      diagnosticPath: extraction?.diagnostic_path ?? null,
      testTime: extraction?.test_time ?? null,
      reportType: extraction?.report_type ?? null,
    },
    vehicle: {
      vin: reviewedOr<string>("vin", extraction?.vin ?? null),
      year: reviewedOr<number>("modelYear", extraction?.model_year ?? null),
      make: reviewedOr<string>("make", extraction?.make ?? null),
      model: reviewedOr<string>("model", extraction?.model ?? null),
      engine: reviewedOr<string>("engine", extraction?.engine ?? null),
      mileage: reviewedOr<number>("odometerMiles", extraction?.odometer_miles ?? scanCase.mileage ?? null),
    },
    systems: canonicalSystems,
    allDtcs,
    derivedCategories,
    legacyCategoryClassification: classifyDtcCategories(dtcRecords, extraction?.modules ?? []),
    extractionQuality: {
      pagesExpected: extraction?.pages_expected ?? null,
      pagesParsed: extraction?.pages_parsed ?? null,
      systemsExpected: extraction?.systems_expected ?? null,
      systemsParsed: extraction?.systems_parsed ?? null,
      dtcsExpected: extraction?.dtcs_expected ?? null,
      dtcsParsed: extraction?.dtcs_parsed ?? null,
      truncated: extraction?.extraction_truncated ?? false,
      warnings: extraction?.warnings ?? [],
      confidence: extraction?.extraction_confidence ?? "medium",
    },
  };
}
