import { describe, expect, it } from "vitest";
import { formatReportForCopy } from "@/lib/scan-diagnostics/report-copy-format";
import type { ScanReportVisibleResult } from "@/lib/ai-diagnostics/redaction";

function baseResult(overrides: Partial<ScanReportVisibleResult> = {}): ScanReportVisibleResult {
  return {
    vehicleSummary: { vin: null, make: null, model: null, modelYear: null, engine: null, odometerMiles: null },
    dtcs: [],
    safety: { findings: [] },
    schemaVersion: "2.0",
    scannerMeta: {
      scannerBrand: null,
      diagnosticApplicationVersion: null,
      vehicleSoftwareVersion: null,
      diagnosticPath: null,
      testTime: null,
      reportType: null,
    },
    healthSummary: {
      faultedSystemCount: 0,
      okSystemCount: 0,
      totalDtcCount: 0,
      currentCount: 0,
      historyCount: 0,
      permanentCount: 0,
      intermittentCount: 0,
      networkCount: 0,
      batteryVoltageCount: 0,
      safetyCriticalCount: 0,
    },
    moduleHealthTable: [],
    patterns: [],
    extractionQuality: { truncated: false, confidence: "high", warnings: [] },
    ...overrides,
  };
}

describe("formatReportForCopy", () => {
  it("falls back to honest placeholders when vehicle fields are absent", () => {
    const text = formatReportForCopy(baseResult());
    expect(text).toContain("Vehicle: Not provided in report");
    expect(text).toContain("VIN: Not provided in report");
    expect(text).toContain("DTCs: None recorded");
  });

  it("includes vehicle summary and DTCs when present", () => {
    const text = formatReportForCopy(
      baseResult({
        vehicleSummary: { vin: "1HGCM82633A123456", make: "Honda", model: "Civic", modelYear: 2019, engine: "2.0L", odometerMiles: 45000 },
        dtcs: [{ module: "PCM", code: "P0301" }, { module: null, code: "P0420" }] as ScanReportVisibleResult["dtcs"],
      }),
    );
    expect(text).toContain("Vehicle: 2019 Honda Civic");
    expect(text).toContain("VIN: 1HGCM82633A123456");
    expect(text).toContain("Engine: 2.0L");
    expect(text).toContain("DTCs: P0301 (PCM), P0420");
  });

  it("omits the ranked-causes/recommended-tests sections entirely when absent (never fabricates them)", () => {
    const text = formatReportForCopy(baseResult());
    expect(text).not.toContain("LIKELY CAUSES");
    expect(text).not.toContain("RECOMMENDED TESTS");
  });

  it("includes likely causes with confidence and recommended tests when present", () => {
    const text = formatReportForCopy(
      baseResult({
        rankedCauses: [
          {
            cause: "Failing coil pack",
            confidenceLevel: "high",
            complaintCorrelation: "unknown",
            rationale: "Misfire pattern matches cylinder 1",
            supportingEvidence: [],
            contradictingEvidence: [],
            confirmationTestsRequired: [],
          },
        ],
        recommendedTests: [{ step: "Swap coil and retest", purpose: "Confirm", expectedResult: "Misfire clears" }],
      }),
    );
    expect(text).toContain("LIKELY CAUSES");
    expect(text).toContain("1. Failing coil pack (confidence: high)");
    expect(text).toContain("Misfire pattern matches cylinder 1");
    expect(text).toContain("RECOMMENDED TESTS");
    expect(text).toContain("1. Swap coil and retest — expected: Misfire clears");
  });

  it("includes safety warnings with severity when present, omits the section when absent", () => {
    const withSafety = formatReportForCopy(
      baseResult({ safety: { findings: [{ ruleId: "r1", severity: "block", message: "Do not drive" }] } }),
    );
    expect(withSafety).toContain("SAFETY WARNINGS");
    expect(withSafety).toContain("[BLOCK] Do not drive");

    const withoutSafety = formatReportForCopy(baseResult());
    expect(withoutSafety).not.toContain("SAFETY WARNINGS");
  });

  it("never includes technician notes, symptoms, or complaint text (not part of the visible-result shape)", () => {
    const text = formatReportForCopy(baseResult());
    // formatReportForCopy only ever receives ScanReportVisibleResult, which
    // structurally has no notes/symptoms/complaint fields — this is a
    // regression guard in case those are ever added to the type without a
    // deliberate decision to surface them in the copy export too.
    expect(text.toLowerCase()).not.toContain("complaint");
    expect(text.toLowerCase()).not.toContain("symptom");
  });
});
