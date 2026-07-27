import { describe, expect, it } from "vitest";
import { filterScanReportForAccessLevel, LOCKED_SECTION_CATALOG } from "@/lib/ai-diagnostics/redaction";
import type { AiDiagnosticUsageSummary } from "@/lib/ai-diagnostics/usage";
import type { ScanReport, ScanExtraction, ScanDtcRecord } from "@/lib/types";

const EXTRACTION: ScanExtraction = {
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
};

const DTC_RECORDS: ScanDtcRecord[] = [
  {
    id: "dtc-1",
    case_id: "case-1",
    module: "ECM",
    code: "P0171",
    status: "current",
    description_raw: null,
    source: "extracted",
    created_at: new Date(0).toISOString(),
  },
];

const REPORT: ScanReport = {
  id: "report-1",
  case_id: "case-1",
  ai_run_id: "run-1",
  ranked_causes: [
    {
      cause: "Vacuum leak at intake manifold gasket",
      confidenceLevel: "medium",
      rationale: "P0171 lean code with rough idle matches a common vacuum leak pattern.",
      supportingEvidence: ["P0171 present"],
      contradictingEvidence: [],
      confirmationTestsRequired: ["Smoke test intake system"],
    },
    {
      cause: "Failed PCV valve",
      confidenceLevel: "low",
      rationale: "Secondary possibility given similar symptom profile.",
      supportingEvidence: [],
      contradictingEvidence: [],
      confirmationTestsRequired: [],
    },
    {
      cause: "Cracked intake boot",
      confidenceLevel: "low",
      rationale: "Third-ranked possibility.",
      supportingEvidence: [],
      contradictingEvidence: [],
      confirmationTestsRequired: [],
    },
  ],
  recommended_tests: [
    { step: "Smoke test intake system", purpose: "Locate the leak source", expectedResult: "Smoke escaping at leak point" },
    { step: "Inspect PCV valve", purpose: "Rule out PCV failure", expectedResult: "Valve rattles when shaken" },
    { step: "Visual inspection of intake boot", purpose: "Check for cracks", expectedResult: "No visible cracking" },
  ],
  safety_warnings: [{ ruleId: "example-rule", severity: "warn", message: "Example safety note." }],
  missing_information: ["No live fuel trim data provided"],
  confidence: 70,
  confidence_level: "medium",
  confidence_rationale: ["Base confidence of 70 for a single provider."],
  schema_version: "2.0",
  generated_at: new Date(0).toISOString(),
};

const PREVIEW_USAGE: AiDiagnosticUsageSummary = {
  accessLevel: "preview",
  previewsUsedToday: 1,
  previewDailyLimit: 2,
  fullReportsUsedToday: 0,
  fullReportsUsedThisMonth: 0,
  fullDailyLimit: 0,
  fullMonthlyLimit: 0,
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

describe("filterScanReportForAccessLevel — preview", () => {
  const result = filterScanReportForAccessLevel({
    report: REPORT,
    extraction: EXTRACTION,
    dtcRecords: DTC_RECORDS,
    accessLevel: "preview",
    usage: PREVIEW_USAGE,
  });

  it("always shows vehicle summary, DTCs, and safety findings", () => {
    expect(result.visibleResult.vehicleSummary.vin).toBe("1FTFW1ET1EFA00001");
    expect(result.visibleResult.dtcs).toEqual([{ module: "ECM", code: "P0171", status: "current" }]);
    expect(result.visibleResult.safety.findings).toHaveLength(1);
  });

  it("does NOT include any real AI-generated content — no ranked causes, tests, confidence detail, or missing-info fields at all", () => {
    expect(result.visibleResult).not.toHaveProperty("rankedCauses");
    expect(result.visibleResult).not.toHaveProperty("recommendedTests");
    expect(result.visibleResult).not.toHaveProperty("confidenceLevel");
    expect(result.visibleResult).not.toHaveProperty("confidenceRationale");
    expect(result.visibleResult).not.toHaveProperty("missingInformation");
    expect(result.visibleResult).not.toHaveProperty("previewFindings");
    expect(result.visibleResult).not.toHaveProperty("previewTests");
  });

  it("never leaks any ranked-cause or recommended-test text anywhere in the serialized result", () => {
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("supportingEvidence");
    expect(serialized).not.toContain("confirmationTestsRequired");
    expect(serialized).not.toContain("purpose");
    expect(serialized).not.toContain("expectedResult");
    expect(serialized).not.toContain("Vacuum leak at intake manifold gasket");
    expect(serialized).not.toContain("Failed PCV valve");
    expect(serialized).not.toContain("Cracked intake boot");
    expect(serialized).not.toContain("Smoke test intake system");
    expect(serialized).not.toContain("Inspect PCV valve");
    expect(serialized).not.toContain("Visual inspection of intake boot");
  });

  it("lists the static locked-section catalog with upgradeRequired true", () => {
    expect(result.lockedSections).toEqual(LOCKED_SECTION_CATALOG.map(({ key, title }) => ({ key, title })));
    expect(result.upgradeRequired).toBe(true);
    expect(result.accessLevel).toBe("preview");
  });

  it("reports usage as dailyLimit/usedToday/remainingToday", () => {
    expect(result.usage).toEqual({ dailyLimit: 2, usedToday: 1, remainingToday: 1 });
  });
});

describe("filterScanReportForAccessLevel — full", () => {
  const result = filterScanReportForAccessLevel({
    report: REPORT,
    extraction: EXTRACTION,
    dtcRecords: DTC_RECORDS,
    accessLevel: "full",
    usage: FULL_USAGE,
  });

  it("includes the complete ranked causes and tests, unredacted", () => {
    expect(result.visibleResult.rankedCauses).toHaveLength(3);
    expect(result.visibleResult.recommendedTests).toHaveLength(3);
    expect(result.visibleResult.confidenceLevel).toBe("medium");
    expect(result.visibleResult.missingInformation).toEqual(["No live fuel trim data provided"]);
  });

  it("does not include the preview-only reduced fields", () => {
    expect(result.visibleResult).not.toHaveProperty("previewFindings");
    expect(result.visibleResult).not.toHaveProperty("previewTests");
  });

  it("has no locked sections and does not require an upgrade", () => {
    expect(result.lockedSections).toEqual([]);
    expect(result.upgradeRequired).toBe(false);
  });
});

describe("filterScanReportForAccessLevel — full, with a localized report", () => {
  it("serves the translated content and surfaces the resolved locale, not the English canonical", () => {
    const result = filterScanReportForAccessLevel({
      report: REPORT,
      extraction: EXTRACTION,
      dtcRecords: DTC_RECORDS,
      accessLevel: "full",
      usage: FULL_USAGE,
      localization: {
        requestedLocale: "es",
        resolvedLocale: "es",
        fallbackUsed: false,
        rankedCauses: [{ ...REPORT.ranked_causes[0], cause: "Fuga de vacío" } as never],
        recommendedTests: [{ ...REPORT.recommended_tests[0], step: "Prueba de humo" } as never],
        missingInformation: ["No se proporcionaron datos de ajuste de combustible en vivo"],
      },
    });

    expect(result.visibleResult.rankedCauses?.[0]).toMatchObject({ cause: "Fuga de vacío" });
    expect(result.visibleResult.recommendedTests?.[0]).toMatchObject({ step: "Prueba de humo" });
    expect(result.visibleResult.missingInformation).toEqual([
      "No se proporcionaron datos de ajuste de combustible en vivo",
    ]);
    expect(result.visibleResult.requestedLocale).toBe("es");
    expect(result.visibleResult.resolvedLocale).toBe("es");
    expect(result.visibleResult.fallbackUsed).toBe(false);
  });

  it("marks fallbackUsed and resolvedLocale 'en' when translation fell back, without touching English content", () => {
    const result = filterScanReportForAccessLevel({
      report: REPORT,
      extraction: EXTRACTION,
      dtcRecords: DTC_RECORDS,
      accessLevel: "full",
      usage: FULL_USAGE,
      localization: {
        requestedLocale: "es",
        resolvedLocale: "en",
        fallbackUsed: true,
        rankedCauses: REPORT.ranked_causes as never,
        recommendedTests: REPORT.recommended_tests as never,
        missingInformation: REPORT.missing_information,
      },
    });

    expect(result.visibleResult.requestedLocale).toBe("es");
    expect(result.visibleResult.resolvedLocale).toBe("en");
    expect(result.visibleResult.fallbackUsed).toBe(true);
    expect(result.visibleResult.rankedCauses).toHaveLength(3);
  });
});
