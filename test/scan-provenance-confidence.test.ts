// M-DIAG0.1 Phase 6 tests — extraction provenance (Phase 3) and confidence
// semantics (Phase 4). See docs/M-DIAG0.1-SAFETY-PROVENANCE-REMEDIATION.md.
import { describe, expect, it } from "vitest";
import { extractionProvenanceFrom, filterScanReportForAccessLevel } from "@/lib/ai-diagnostics/redaction";
import { buildCanonicalVehicleScan } from "@/lib/scan-diagnostics/canonical-scan";
import type { AiDiagnosticUsageSummary } from "@/lib/ai-diagnostics/usage";
import type { ScanCase, ScanReport, ScanExtraction, ScanDtcRecord } from "@/lib/types";

const SCAN_CASE: ScanCase = {
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
  technician_completed_at: null,
  technician_completed_by: null,
};

function extraction(overrides: Partial<ScanExtraction>): ScanExtraction {
  return {
    id: "ext-1",
    case_id: "case-1",
    file_id: "file-1",
    parser_id: "pdf-parser",
    parser_version: "1",
    vin: "1FTFW1ET1EFA00001",
    make: "Ford",
    model: "F-150",
    model_year: 2019,
    engine: "5.0L V8",
    odometer_miles: 60000,
    modules: [],
    freeze_frame: [],
    live_data: [],
    image_only_pdf: false,
    warnings: [],
    reviewed_fields: {},
    extracted_at: new Date(0).toISOString(),
    reviewed_at: null,
    scanner_brand: null,
    diagnostic_application_version: null,
    vehicle_software_version: null,
    diagnostic_path: null,
    test_time: null,
    report_type: null,
    pages_expected: null,
    pages_parsed: null,
    systems_expected: null,
    systems_parsed: null,
    dtcs_expected: null,
    dtcs_parsed: null,
    extraction_truncated: false,
    extraction_confidence: null,
    image_evidence: [],
    ...overrides,
  };
}

const DTC_RECORDS: ScanDtcRecord[] = [];

const REPORT: ScanReport = {
  id: "report-1",
  case_id: "case-1",
  ai_run_id: "run-1",
  ranked_causes: [],
  recommended_tests: [],
  safety_warnings: [],
  missing_information: [],
  confidence: 70,
  confidence_level: "medium",
  confidence_rationale: [],
  schema_version: "2.0",
  generated_at: new Date(0).toISOString(),
};

const FULL_USAGE: AiDiagnosticUsageSummary = {
  accessLevel: "full",
  previewsUsedToday: 0,
  previewDailyLimit: null,
  fullReportsUsedToday: 3,
  fullReportsUsedThisMonth: 12,
  fullDailyLimit: 5,
  fullMonthlyLimit: 30,
};

describe("extractionProvenanceFrom (Phase 3, Phase 6 #12)", () => {
  it("reports deterministic_parser for a real deterministic parser id", () => {
    expect(extractionProvenanceFrom(extraction({ parser_id: "pdf-parser" }))).toBe("deterministic_parser");
    expect(extractionProvenanceFrom(extraction({ parser_id: "generic-txt" }))).toBe("deterministic_parser");
  });

  it("reports ai_assisted_vision for the vision-extraction parser id (Phase 6 #11)", () => {
    expect(extractionProvenanceFrom(extraction({ parser_id: "vision-extraction" }))).toBe("ai_assisted_vision");
  });

  it("reports unknown when there is no extraction row at all", () => {
    expect(extractionProvenanceFrom(null)).toBe("unknown");
  });
});

describe("filterScanReportForAccessLevel — extractionProvenance survives the persisted-row read path (Phase 6 #13)", () => {
  it("threads a deterministic-parser extraction's provenance into the visible result", () => {
    const ext = extraction({ parser_id: "pdf-parser" });
    const canonicalScan = buildCanonicalVehicleScan(SCAN_CASE, ext, DTC_RECORDS, []);
    const result = filterScanReportForAccessLevel({
      report: REPORT,
      extraction: ext,
      dtcRecords: DTC_RECORDS,
      accessLevel: "full",
      usage: FULL_USAGE,
      canonicalScan,
      patterns: [],
    });
    expect(result.visibleResult.extractionProvenance).toBe("deterministic_parser");
  });

  it("threads an AI-assisted vision extraction's provenance into the visible result, and it is stable across repeated reads (i.e. reload)", () => {
    const ext = extraction({ parser_id: "vision-extraction" });
    const canonicalScan = buildCanonicalVehicleScan(SCAN_CASE, ext, DTC_RECORDS, []);
    const params = {
      report: REPORT,
      extraction: ext,
      dtcRecords: DTC_RECORDS,
      accessLevel: "full" as const,
      usage: FULL_USAGE,
      canonicalScan,
      patterns: [],
    };
    const firstRead = filterScanReportForAccessLevel(params);
    const secondRead = filterScanReportForAccessLevel(params); // simulates a page reload re-deriving from the same persisted row
    expect(firstRead.visibleResult.extractionProvenance).toBe("ai_assisted_vision");
    expect(secondRead.visibleResult.extractionProvenance).toBe("ai_assisted_vision");
  });

  it("is present at preview access level too — provenance is deterministic/always-visible, not AI-generated content", () => {
    const ext = extraction({ parser_id: "vision-extraction" });
    const canonicalScan = buildCanonicalVehicleScan(SCAN_CASE, ext, DTC_RECORDS, []);
    const result = filterScanReportForAccessLevel({
      report: REPORT,
      extraction: ext,
      dtcRecords: DTC_RECORDS,
      accessLevel: "preview",
      usage: {
        accessLevel: "preview",
        previewsUsedToday: 1,
        previewDailyLimit: 2,
        fullReportsUsedToday: 0,
        fullReportsUsedThisMonth: 0,
        fullDailyLimit: 0,
        fullMonthlyLimit: 0,
      },
      canonicalScan,
      patterns: [],
    });
    expect(result.visibleResult.extractionProvenance).toBe("ai_assisted_vision");
  });
});

describe("Extraction confidence — never silently defaults to medium (Phase 4, Phase 6 #14/#15)", () => {
  it("reports unknown when there is no extraction row at all", () => {
    const canonicalScan = buildCanonicalVehicleScan(SCAN_CASE, null, [], []);
    expect(canonicalScan.extractionQuality.confidence).toBe("unknown");
  });

  it("reports unknown when the extraction row exists but extraction_confidence is null (Phase 6 #14)", () => {
    const ext = extraction({ extraction_confidence: null });
    const canonicalScan = buildCanonicalVehicleScan(SCAN_CASE, ext, [], []);
    expect(canonicalScan.extractionQuality.confidence).toBe("unknown");
  });

  it("preserves an explicit medium confidence value exactly — never altered (Phase 6 #15)", () => {
    const ext = extraction({ extraction_confidence: "medium" });
    const canonicalScan = buildCanonicalVehicleScan(SCAN_CASE, ext, [], []);
    expect(canonicalScan.extractionQuality.confidence).toBe("medium");
  });

  it("preserves an explicit high confidence value exactly", () => {
    const ext = extraction({ extraction_confidence: "high" });
    const canonicalScan = buildCanonicalVehicleScan(SCAN_CASE, ext, [], []);
    expect(canonicalScan.extractionQuality.confidence).toBe("high");
  });

  it("preserves an explicit low confidence value exactly", () => {
    const ext = extraction({ extraction_confidence: "low" });
    const canonicalScan = buildCanonicalVehicleScan(SCAN_CASE, ext, [], []);
    expect(canonicalScan.extractionQuality.confidence).toBe("low");
  });

  it("a legacy extraction row (predating this field) still renders safely as unknown, not a crash or a fabricated medium", () => {
    // Simulates a pre-existing DB row from before extraction_confidence
    // existed — the column is nullable, so this is exactly what a legacy
    // row looks like at the type layer.
    const legacyExt = extraction({ extraction_confidence: null });
    expect(() => buildCanonicalVehicleScan(SCAN_CASE, legacyExt, [], [])).not.toThrow();
    const canonicalScan = buildCanonicalVehicleScan(SCAN_CASE, legacyExt, [], []);
    expect(canonicalScan.extractionQuality.confidence).toBe("unknown");
  });

  it("threads unknown confidence through to the redacted, customer-visible result", () => {
    const ext = extraction({ extraction_confidence: null });
    const canonicalScan = buildCanonicalVehicleScan(SCAN_CASE, ext, [], []);
    const result = filterScanReportForAccessLevel({
      report: REPORT,
      extraction: ext,
      dtcRecords: [],
      accessLevel: "full",
      usage: FULL_USAGE,
      canonicalScan,
      patterns: [],
    });
    expect(result.visibleResult.extractionQuality.confidence).toBe("unknown");
  });
});
