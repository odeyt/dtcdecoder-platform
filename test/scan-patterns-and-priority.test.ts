import { describe, expect, it } from "vitest";
import { buildParsedScanReportFromText } from "@/lib/scan-diagnostics/parsers/plain-text-extraction";
import { normalizeStoredDtcStatus } from "@/lib/scan-diagnostics/extraction";
import {
  classifyDtcRelevance,
  isSafetyCriticalSystem,
} from "@/lib/scan-diagnostics/parsers/category-classification";
import { buildCanonicalVehicleScan } from "@/lib/scan-diagnostics/canonical-scan";
import { detectPatterns } from "@/lib/scan-diagnostics/patterns";
import { computeDiagnosticPriority } from "@/lib/scan-diagnostics/priority";
import type { ScanCase, ScanDtcRecord, ScanExtraction, ScanSystem } from "@/lib/types";
import { ZOTYE_SCAN_REPORT_TEXT, ZOTYE_TEST_VIN } from "./fixtures/zotye-scan-report";

// Converts a ParsedScanReport into the same DB-row shape persistExtraction()
// would produce, without touching Supabase — lets the pattern/priority
// engines (which read the persisted canonical shape) be tested against the
// real Zotye fixture in a pure unit test.
function toDtcRecords(parsed: ReturnType<typeof buildParsedScanReportFromText>): ScanDtcRecord[] {
  return parsed.dtcCodes.map((dtc, i) => {
    const relevance = classifyDtcRelevance(dtc.code, dtc.descriptionRaw);
    return {
      id: `dtc-${i}`,
      case_id: "case-1",
      module: dtc.module ?? null,
      code: dtc.code,
      status: normalizeStoredDtcStatus(dtc.status),
      description_raw: dtc.descriptionRaw ?? null,
      source: "extracted",
      created_at: new Date(0).toISOString(),
      system_name: dtc.systemName ?? null,
      source_page: dtc.sourcePage ?? null,
      source_text: dtc.sourceText ?? null,
      safety_relevance: relevance.safetyRelevance || isSafetyCriticalSystem(dtc.systemName),
      network_relevance: relevance.networkRelevance,
      battery_relevance: relevance.batteryRelevance,
      bus_off_relevance: relevance.busOffRelevance,
    };
  });
}

function toSystems(parsed: ReturnType<typeof buildParsedScanReportFromText>): ScanSystem[] {
  return parsed.systems.map((s, i) => ({
    id: `sys-${i}`,
    case_id: "case-1",
    system_name: s.systemName,
    module_name: s.moduleName ?? null,
    status: s.status,
    dtc_count_reported: s.dtcCountReported ?? null,
    dtc_count_extracted: s.dtcCountExtracted,
    extraction_complete: s.dtcCountReported === undefined || s.dtcCountExtracted >= s.dtcCountReported,
    created_at: new Date(0).toISOString(),
  }));
}

function baseCase(): ScanCase {
  return {
    id: "case-1",
    user_id: "user-1",
    status: "completed",
    status_updated_at: new Date(0).toISOString(),
    error_message: null,
    complaint: null,
    symptoms: [],
    mileage: null,
    recent_repairs: null,
    battery_condition: null,
    technician_notes: null,
    title: null,
    report_language: "en",
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  };
}

function extractionFrom(parsed: ReturnType<typeof buildParsedScanReportFromText>): ScanExtraction {
  return {
    id: "ext-1",
    case_id: "case-1",
    file_id: "file-1",
    parser_id: "generic-pdf",
    parser_version: "1.0.0",
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
    reviewed_fields: {},
    extracted_at: new Date(0).toISOString(),
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
  };
}

const parsed = buildParsedScanReportFromText(ZOTYE_SCAN_REPORT_TEXT);
const scanCase = baseCase();
const extraction = extractionFrom(parsed);
const dtcRecords = toDtcRecords(parsed);
const systems = toSystems(parsed);
const canonicalScan = buildCanonicalVehicleScan(scanCase, extraction, dtcRecords, systems);

describe("buildCanonicalVehicleScan — Zotye case", () => {
  it("preserves vehicle metadata and VIN", () => {
    expect(canonicalScan.vehicle.vin).toBe(ZOTYE_TEST_VIN);
    expect(canonicalScan.vehicle.year).toBe(2017);
    expect(canonicalScan.vehicle.make).toBe("ZOTYE");
    expect(canonicalScan.vehicle.model).toBe("Domy X7");
  });

  it("derives network, lost-communication, battery, and bus-off categories from real evidence", () => {
    expect(canonicalScan.derivedCategories.networkFaults.length).toBeGreaterThan(30);
    expect(canonicalScan.derivedCategories.lostCommunicationFaults.length).toBeGreaterThan(10);
    expect(canonicalScan.derivedCategories.batteryVoltageFaults).toContain("B111716");
    expect(canonicalScan.derivedCategories.busOffFaults.length).toBeGreaterThan(0);
    expect(canonicalScan.derivedCategories.safetySystemFaults.length).toBeGreaterThan(0);
  });

  it("counts all 14 systems (12 faulted + 2 reported OK), matching the source report exactly", () => {
    expect(canonicalScan.systems).toHaveLength(14);
    expect(canonicalScan.systems.filter((s) => s.status === "faulted")).toHaveLength(12);
    expect(canonicalScan.systems.filter((s) => s.status === "ok")).toHaveLength(2);
  });

  it("never claims a category is not stated when the legacy classification also finds it", () => {
    expect(canonicalScan.legacyCategoryClassification.networkFaults.status).toBe("found");
    expect(canonicalScan.legacyCategoryClassification.batteryRelatedFaults.status).toBe("found");
  });
});

describe("detectPatterns — Zotye case", () => {
  const patterns = detectPatterns(canonicalScan);
  const patternTypes = patterns.map((p) => p.patternType);

  it("detects a vehicle-wide network communication event", () => {
    expect(patternTypes).toContain("network_communication_event");
  });

  it("detects a multi-module low-voltage event", () => {
    expect(patternTypes).toContain("multi_module_low_voltage");
  });

  it("detects the bus-off condition", () => {
    expect(patternTypes).toContain("bus_off_condition");
  });

  it("detects an active safety-system fault (SRS B1054FF, current)", () => {
    const finding = patterns.find((p) => p.patternType === "safety_system_active_fault");
    expect(finding).toBeDefined();
    expect(finding?.evidence.codes).toContain("B1054FF");
  });

  it("detects a single-node failure pattern naming a plausible target module", () => {
    const finding = patterns.find((p) => p.patternType === "single_node_failure");
    expect(finding).toBeDefined();
  });

  it("never asserts a common-cause pattern as a certainty (hypothesis language only)", () => {
    const finding = patterns.find((p) => p.patternType === "possible_common_cause");
    if (finding) {
      expect(JSON.stringify(finding.evidence).toLowerCase()).toContain("hypothesis");
    }
  });
});

describe("computeDiagnosticPriority — Zotye case", () => {
  const patterns = detectPatterns(canonicalScan);
  const priority = computeDiagnosticPriority(canonicalScan, patterns);

  it("puts the current, safety-relevant SRS fault (B1054FF) in fix-first", () => {
    expect(priority.fixFirst.map((d) => d.normalizedCode)).toContain("B1054FF");
  });

  it("puts the current engine fault P000A in diagnose-next, not fix-first", () => {
    expect(priority.diagnoseNext.map((d) => d.normalizedCode)).toContain("P000A");
    expect(priority.fixFirst.map((d) => d.normalizedCode)).not.toContain("P000A");
  });

  it("puts history-status P0300/P0303 in monitor-recheck", () => {
    const codes = priority.monitorRecheck.map((d) => d.normalizedCode);
    expect(codes).toContain("P0300");
    expect(codes).toContain("P0303");
  });

  it("puts reference-only P0015/P000B in historical-reference, never outranking a current fault", () => {
    const codes = priority.historicalReference.map((d) => d.normalizedCode);
    expect(codes).toContain("P0015");
    expect(codes).toContain("P000B");
    expect(priority.fixFirst.map((d) => d.normalizedCode)).not.toContain("P0015");
    expect(priority.fixFirst.map((d) => d.normalizedCode)).not.toContain("P000B");
  });

  it("accounts for every extracted DTC across the four buckets", () => {
    const total =
      priority.fixFirst.length +
      priority.diagnoseNext.length +
      priority.monitorRecheck.length +
      priority.historicalReference.length;
    expect(total).toBe(canonicalScan.allDtcs.length);
  });
});
