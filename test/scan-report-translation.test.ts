import { describe, expect, it } from "vitest";
import {
  extractTranslatableStrings,
  applyTranslatedStrings,
  translateScanReport,
  type ScanReportTranslatable,
} from "@/lib/scan-diagnostics/report-translation";
import type {
  LocalizedDiagnosticReport,
  TranslationProvider,
} from "@/lib/ai/translation-provider";

const canonical: ScanReportTranslatable = {
  rankedCauses: [
    {
      cause: "Catalyst efficiency below threshold",
      confidenceLevel: "medium",
      complaintCorrelation: "unknown",
      rationale: "P0420 stored with MIL on",
      supportingEvidence: ["MIL illuminated"],
      contradictingEvidence: [],
      confirmationTestsRequired: ["Check Bank 1 Sensor 2"],
    },
  ],
  recommendedTests: [
    { step: "Read live data", purpose: "Compare O2 sensors", expectedResult: "Bank 1 Sensor 2 switching" },
  ],
  missingInformation: ["Fuel trim data"],
  extractionWarnings: ["Extraction may be incomplete for module ECM."],
};

// Provider stub returning a caller-specified result (ignores the real translate).
function stubProvider(result: Partial<LocalizedDiagnosticReport> & Pick<LocalizedDiagnosticReport, "text">): TranslationProvider {
  return {
    id: "anthropic",
    model: "claude-sonnet-5",
    async translateDiagnosticReport(input) {
      return {
        reportId: input.canonicalReport.id,
        sourceLocale: "en",
        requestedLocale: input.targetLocale,
        resolvedLocale: input.targetLocale,
        provider: "anthropic",
        model: "claude-sonnet-5",
        glossaryVersion: input.glossaryVersion,
        promptVersion: input.promptVersion,
        status: "completed",
        fallbackUsed: false,
        missingTokens: [],
        translatedAt: "2026-07-26T00:00:00.000Z",
        latencyMs: 10,
        ...result,
      };
    },
  };
}

describe("extract/apply round-trip", () => {
  it("apply(extract) is the identity", () => {
    const strings = extractTranslatableStrings(canonical);
    expect(applyTranslatedStrings(canonical, strings)).toEqual(canonical);
  });

  it("extracts strings in a stable, complete order", () => {
    expect(extractTranslatableStrings(canonical)).toEqual([
      "Catalyst efficiency below threshold",
      "P0420 stored with MIL on",
      "MIL illuminated",
      "Check Bank 1 Sensor 2",
      "Read live data",
      "Compare O2 sensors",
      "Bank 1 Sensor 2 switching",
      "Fuel trim data",
      "Extraction may be incomplete for module ECM.",
    ]);
  });

  it("throws on length mismatch", () => {
    expect(() => applyTranslatedStrings(canonical, ["only one"])).toThrow();
  });
});

describe("translateScanReport", () => {
  const common = { reportId: "rep-1", reportVersion: 2, canonical, glossaryVersion: "7", promptVersion: "2" };

  it("reassembles a successful translation", async () => {
    const translated = extractTranslatableStrings(canonical).map((s) => `ES: ${s}`);
    const provider = stubProvider({ text: JSON.stringify(translated) });
    const r = await translateScanReport({ ...common, targetLocale: "es", provider });
    expect(r.status).toBe("completed");
    expect(r.resolvedLocale).toBe("es");
    expect(r.localized.rankedCauses[0].cause).toBe("ES: Catalyst efficiency below threshold");
    expect(r.localized.recommendedTests[0].expectedResult).toBe("ES: Bank 1 Sensor 2 switching");
  });

  it("falls back to English when the provider fell back", async () => {
    const provider = stubProvider({
      text: "P0420 …",
      resolvedLocale: "en",
      fallbackUsed: true,
      status: "fallback",
      missingTokens: ["P0420"],
    });
    const r = await translateScanReport({ ...common, targetLocale: "es", provider });
    expect(r.status).toBe("fallback");
    expect(r.fallbackUsed).toBe(true);
    expect(r.localized).toEqual(canonical);
  });

  it("falls back to English on a length-mismatched translation", async () => {
    const provider = stubProvider({ text: JSON.stringify(["too", "few"]) });
    const r = await translateScanReport({ ...common, targetLocale: "es", provider });
    expect(r.status).toBe("failed");
    expect(r.localized).toEqual(canonical);
  });

  it("falls back to English on non-JSON output", async () => {
    const provider = stubProvider({ text: "not json at all" });
    const r = await translateScanReport({ ...common, targetLocale: "es", provider });
    expect(r.status).toBe("failed");
    expect(r.localized).toEqual(canonical);
  });

  it("serves the canonical for an English request", async () => {
    const provider = stubProvider({ text: "[]", resolvedLocale: "en", fallbackUsed: false });
    const r = await translateScanReport({ ...common, targetLocale: "en", provider });
    expect(r.status).toBe("completed");
    expect(r.fallbackUsed).toBe(false);
    expect(r.localized).toEqual(canonical);
  });
});
