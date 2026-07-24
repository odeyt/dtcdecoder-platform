import { describe, expect, it } from "vitest";
import { isLegacyReport, resolveConfidenceLabel } from "@/lib/scan-diagnostics/report-presentation";
import type { ScanReport } from "@/lib/types";

function legacyReport(overrides: Partial<ScanReport> = {}): Pick<ScanReport, "schema_version" | "confidence_level"> {
  return {
    schema_version: "1.0",
    confidence_level: null,
    ...overrides,
  };
}

describe("legacy schema_version 1.0 report compatibility", () => {
  it("identifies a schema_version 1.0 report as legacy", () => {
    expect(isLegacyReport(legacyReport())).toBe(true);
  });

  it("identifies a schema_version 2.0 report with a confidence_level as NOT legacy", () => {
    expect(isLegacyReport({ schema_version: "2.0", confidence_level: "medium" })).toBe(false);
  });

  it("still treats a row as legacy if confidence_level is somehow null even when tagged 2.0 (defensive)", () => {
    expect(isLegacyReport({ schema_version: "2.0", confidence_level: null })).toBe(true);
  });

  it("resolves a missing/null confidence level to 'Not established', never a number or blank string", () => {
    expect(resolveConfidenceLabel(null)).toBe("Not established");
    expect(resolveConfidenceLabel(undefined)).toBe("Not established");
  });

  it("resolves an unrecognized legacy value to 'Not established' rather than crashing", () => {
    // Simulates a v1 ranked-cause object that never had confidenceLevel at
    // all (only the deprecated probabilityPercent, which this function is
    // never given — the whole point is it can't reinterpret a number as a
    // level).
    expect(resolveConfidenceLabel("70")).toBe("Not established");
    expect(resolveConfidenceLabel("")).toBe("Not established");
  });

  it("resolves each of the four real levels to their exact display label", () => {
    expect(resolveConfidenceLabel("high")).toBe("High");
    expect(resolveConfidenceLabel("medium")).toBe("Medium");
    expect(resolveConfidenceLabel("low")).toBe("Low");
    expect(resolveConfidenceLabel("insufficient_evidence")).toBe("Insufficient evidence");
  });

  it("never returns a string containing a percent sign or digit-only value for missing data", () => {
    const label = resolveConfidenceLabel(undefined);
    expect(label).not.toMatch(/%/);
    expect(label).not.toMatch(/^\d+$/);
  });
});
