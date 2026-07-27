import { describe, expect, it } from "vitest";
import { buildParsedScanReportFromText } from "@/lib/scan-diagnostics/parsers/plain-text-extraction";
import {
  ZOTYE_SCAN_REPORT_TEXT,
  ZOTYE_TEST_VIN,
  ZOTYE_EXPECTED_SYSTEM_COUNTS,
  ZOTYE_TOTAL_DTC_COUNT,
} from "./fixtures/zotye-scan-report";

// Regression test for the real production validation case documented in
// docs/FULL_SCAN_DATA_LOSS_AUDIT.md — a 66-DTC, 12-system LAUNCH X431 scan
// report that a pre-fix parser reduced to 3 DTCs and no vehicle info.
describe("Zotye scan report — full extraction regression", () => {
  const report = buildParsedScanReportFromText(ZOTYE_SCAN_REPORT_TEXT);

  it("extracts vehicle year, make, model, and VIN", () => {
    expect(report.modelYear).toBe(2017);
    expect(report.make).toBe("ZOTYE");
    expect(report.model).toBe("Domy X7");
    expect(report.vin).toBe(ZOTYE_TEST_VIN);
  });

  it("extracts scanner/report metadata", () => {
    expect(report.vehicleSoftwareVersion).toBe("V18.21");
    expect(report.diagnosticApplicationVersion).toBe("V7.00.012");
    expect(report.testTime).toBe("2026-07-25 15:12:47");
    expect(report.reportType?.toLowerCase()).toBe("pre-repair");
  });

  it(`extracts all ${ZOTYE_TOTAL_DTC_COUNT} DTCs across all 12 systems, not just the engine section`, () => {
    expect(report.dtcCodes).toHaveLength(ZOTYE_TOTAL_DTC_COUNT);
  });

  it("captures the two hex-suffixed engine codes the old regex silently dropped", () => {
    const codes = report.dtcCodes.map((d) => d.code);
    expect(codes).toContain("P000B");
    expect(codes).toContain("P000A");
  });

  it("captures the 6-digit extended manufacturer codes from every non-engine system", () => {
    const codes = report.dtcCodes.map((d) => d.code);
    for (const code of ["P184481", "U121183", "C120700", "B1054FF", "U0100FF", "B111716"]) {
      expect(codes).toContain(code);
    }
  });

  it("reports the correct per-system declared vs extracted DTC count for every system", () => {
    for (const [systemName, expectedCount] of Object.entries(ZOTYE_EXPECTED_SYSTEM_COUNTS)) {
      const system = report.systems.find((s) => s.systemName === systemName);
      expect(system, `missing system: ${systemName}`).toBeDefined();
      expect(system?.dtcCountReported, `${systemName} declared count`).toBe(expectedCount);
      expect(system?.dtcCountExtracted, `${systemName} extracted count`).toBe(expectedCount);
    }
  });

  it("tags every DTC with its owning system", () => {
    const engineCode = report.dtcCodes.find((d) => d.code === "P0300");
    expect(engineCode?.systemName).toBe("1.8T Engine System");
    const gatewayCode = report.dtcCodes.find((d) => d.code === "U016C00");
    expect(gatewayCode?.systemName).toBe("Gateway System (GW)");
  });

  it("captures current/history/reference-only status distinctly from the trailing status text", () => {
    const byCode = new Map(report.dtcCodes.map((d) => [d.code, d.status]));
    expect(byCode.get("P000A")).toBe("Current");
    expect(byCode.get("P0300")).toBe("History");
    expect(byCode.get("P0303")).toBe("History");
    expect(byCode.get("P0015")?.toLowerCase()).toContain("reference");
    expect(byCode.get("P000B")?.toLowerCase()).toContain("reference");
    expect(byCode.get("B1054FF")).toBe("Current");
  });

  it("records EPB and SAS as systems reported OK, not faulted", () => {
    const epb = report.systems.find((s) => s.systemName.includes("Electric Parking Brake"));
    const sas = report.systems.find((s) => s.systemName.includes("Steering Wheel Angle Sensor"));
    expect(epb?.status).toBe("ok");
    expect(sas?.status).toBe("ok");
  });

  it("reports extraction as complete (no system under-extracted) and confidence high", () => {
    expect(report.extractionQuality.truncated).toBe(false);
    expect(report.extractionQuality.confidence).toBe("high");
    expect(report.extractionQuality.dtcsExpected).toBe(ZOTYE_TOTAL_DTC_COUNT);
    expect(report.extractionQuality.dtcsParsed).toBe(ZOTYE_TOTAL_DTC_COUNT);
  });
});
