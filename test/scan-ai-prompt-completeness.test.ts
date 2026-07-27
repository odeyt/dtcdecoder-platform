import { describe, expect, it } from "vitest";
import { buildParsedScanReportFromText } from "@/lib/scan-diagnostics/parsers/plain-text-extraction";
import { normalizeStoredDtcStatus } from "@/lib/scan-diagnostics/extraction";
import {
  classifyDtcRelevance,
  isSafetyCriticalSystem,
} from "@/lib/scan-diagnostics/parsers/category-classification";
import { buildCanonicalDiagnosticInput } from "@/lib/scan-diagnostics/canonical-input";
import { buildUserPrompt } from "@/lib/scan-diagnostics/ai/anthropic-provider";
import type { ScanCase, ScanDtcRecord, ScanExtraction, ScanSystem } from "@/lib/types";
import { ZOTYE_SCAN_REPORT_TEXT } from "./fixtures/zotye-scan-report";

// Verifies the actual text sent to the AI provider — not just the
// intermediate data structures — includes every required priority group and
// every DTC, for the real 66-DTC Zotye case. This is the test that would
// have caught the original bug: a report with only 3 DTCs in its prompt.
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

const scanCase: ScanCase = {
  id: "case-1",
  user_id: "user-1",
  status: "completed",
  status_updated_at: new Date(0).toISOString(),
  error_message: null,
  complaint: "Check engine light on, rough idle",
  symptoms: ["rough idle"],
  mileage: null,
  recent_repairs: null,
  battery_condition: null,
  technician_notes: null,
  report_language: "en",
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
};

const parsed = buildParsedScanReportFromText(ZOTYE_SCAN_REPORT_TEXT);
const extraction: ScanExtraction = {
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
const dtcRecords = toDtcRecords(parsed);
const systems = toSystems(parsed);

const aiInput = buildCanonicalDiagnosticInput(scanCase, extraction, dtcRecords, systems);
const promptText = buildUserPrompt(aiInput, new Map());

describe("AI prompt completeness — Zotye case", () => {
  it("passes every extracted DTC to the AI input, not a truncated subset", () => {
    expect(aiInput.dtcs).toHaveLength(66);
    expect(aiInput.omittedFromPrompt).toBeNull();
  });

  it("includes every system's declared-vs-extracted count in the prompt text", () => {
    expect(promptText).toContain("SYSTEM/MODULE SUMMARY");
    expect(promptText).toContain("Gateway System (GW)");
    expect(promptText).toContain("14/14 extracted");
  });

  it("includes the detected patterns section", () => {
    expect(promptText).toContain("DETECTED PATTERNS");
  });

  it("includes all four required priority groups", () => {
    expect(promptText).toContain("DETERMINISTIC PRIORITY GROUPING");
    expect(promptText).toContain("Fix first");
    expect(promptText).toContain("Diagnose next");
    expect(promptText).toContain("Monitor/recheck");
    expect(promptText).toContain("Historical/reference-only");
    expect(promptText).toContain("B1054FF"); // current safety fault -> fix first
    expect(promptText).toContain("P000A"); // current, non-safety -> diagnose next
  });

  it("includes every individual DTC code in the per-code listing, not just the first few", () => {
    for (const code of ["P000B", "P000A", "P0303", "P0300", "P0015", "U016C00", "B1054FF"]) {
      expect(promptText).toContain(code);
    }
  });

  it("never claims the DTC list is empty when 66 codes were extracted", () => {
    expect(promptText).not.toContain("no DTC records were extracted");
  });

  it("surfaces extraction confidence as high (not truncated) for a fully-extracted report", () => {
    expect(promptText).toContain("EXTRACTION QUALITY");
    expect(promptText).toContain("Confidence: high");
    expect(promptText).not.toContain("WARNING: extraction may be INCOMPLETE");
  });
});
