import { describe, expect, it } from "vitest";
import { computeConfidence, sanitizeMissingInformation } from "@/lib/scan-diagnostics/confidence";
import { classifyDtcCategories } from "@/lib/scan-diagnostics/parsers/category-classification";
import type { CanonicalDiagnosticInput, DiagnosticAiOutput } from "@/lib/scan-diagnostics/schemas";
import type { DiagnosticAIProviderResult } from "@/lib/scan-diagnostics/ai/provider";

// Deliberately minimal — vin, complaint, and symptoms are the only "known"
// fields; year/make/model/mileage/freeze-frame/live-data/systems/patterns
// are all absent, so each of those NEW factors (see confidence.ts) applies
// its real, documented penalty. Score: 70 (base) - 5 (no year/make/model)
// - 3 (no mileage) - 5 (no freeze frame) - 5 (no live data) = 52.
const BASE_INPUT: CanonicalDiagnosticInput = {
  caseId: "case-1",
  vehicle: { vin: "1FTFW1ET1EFA00001" },
  complaint: "Check engine light on",
  symptoms: ["rough idle"],
  modules: [],
  dtcs: [],
  systems: [],
  patterns: [],
  freezeFrame: [],
  liveData: [],
  imageOnlyPdf: false,
  extractionWarnings: [],
  dtcCategoryClassification: classifyDtcCategories([], []),
};
const BASE_SCORE = 52;

// A genuinely complete, well-corroborated multi-system case — used only by
// the two tests that need a score high enough to exercise the upper clamp/
// "high" band, since BASE_INPUT's minimal data can never reach either.
const RICH_INPUT: CanonicalDiagnosticInput = {
  ...BASE_INPUT,
  vehicle: { vin: "1FTFW1ET1EFA00001", year: 2020, make: "Ford", model: "F-150", mileage: 50000 },
  freezeFrame: [{ rpm: 800 }],
  liveData: [{ rpm: 800 }],
  systems: [
    { systemName: "Engine", status: "faulted", dtcCountExtracted: 2, extractionComplete: true },
    { systemName: "Transmission", status: "faulted", dtcCountExtracted: 1, extractionComplete: true },
    { systemName: "ABS", status: "faulted", dtcCountExtracted: 1, extractionComplete: true },
    { systemName: "EPB", status: "ok", dtcCountExtracted: 0, extractionComplete: true },
  ],
  patterns: [
    {
      patternType: "bus_off_condition",
      severity: "critical",
      name: "CAN bus-off condition reported",
      evidence: {},
      affectedModules: ["Gateway"],
    },
  ],
  priority: {
    fixFirstCodes: ["P0001"],
    diagnoseNextCodes: [],
    monitorRecheckCodes: [],
    historicalReferenceCodes: [],
  },
};

function output(overrides: Partial<DiagnosticAiOutput> = {}): DiagnosticAiOutput {
  return {
    summary: "summary",
    rankedCauses: [
      {
        cause: "Vacuum leak",
        confidenceLevel: "medium",
        complaintCorrelation: "unknown",
        rationale: "r",
        supportingEvidence: [],
        contradictingEvidence: [],
        confirmationTestsRequired: [],
      },
    ],
    recommendedTests: [],
    safetyWarnings: [],
    missingInformation: [],
    ...overrides,
  };
}

function result(o: DiagnosticAiOutput): DiagnosticAIProviderResult {
  return {
    providerId: "anthropic-claude-sonnet-5",
    modelId: "claude-sonnet-5",
    promptVersion: "2026-07-safety-v2",
    output: o,
    tokens: { input: 0, output: 0 },
  };
}

describe("computeConfidence — internal deterministic score (never displayed directly)", () => {
  it("returns the single-provider base of 70, adjusted for the vehicle/freeze-frame/live-data gaps in BASE_INPUT", () => {
    const { internalScore, rationale } = computeConfidence([result(output())], BASE_INPUT, { verdict: "pass" });
    expect(internalScore).toBe(BASE_SCORE);
    expect(rationale[0]).toMatch(/Base confidence of 70/);
  });

  it("deducts 20 for a missing VIN", () => {
    const { internalScore } = computeConfidence(
      [result(output())],
      { ...BASE_INPUT, vehicle: {} },
      { verdict: "pass" },
    );
    expect(internalScore).toBe(BASE_SCORE - 20);
  });

  it("deducts 10 for no complaint or symptoms", () => {
    const { internalScore } = computeConfidence(
      [result(output())],
      { ...BASE_INPUT, complaint: null, symptoms: [] },
      { verdict: "pass" },
    );
    expect(internalScore).toBe(BASE_SCORE - 10);
  });

  it("deducts 15 for an image-only PDF", () => {
    const { internalScore } = computeConfidence(
      [result(output())],
      { ...BASE_INPUT, imageOnlyPdf: true },
      { verdict: "pass" },
    );
    expect(internalScore).toBe(BASE_SCORE - 15);
  });

  it("deducts 10 for unresolved extraction warnings", () => {
    const { internalScore } = computeConfidence(
      [result(output())],
      { ...BASE_INPUT, extractionWarnings: ["No dedicated DTC column found"] },
      { verdict: "pass" },
    );
    expect(internalScore).toBe(BASE_SCORE - 10);
  });

  it("deducts 15 for extraction marked truncated (declared more DTCs than were extracted)", () => {
    const { internalScore, rationale } = computeConfidence(
      [result(output())],
      { ...BASE_INPUT, scanExtractionQuality: { truncated: true, confidence: "low" } },
      { verdict: "pass" },
    );
    expect(internalScore).toBe(BASE_SCORE - 15);
    expect(rationale.some((r) => /INCOMPLETE/.test(r))).toBe(true);
  });

  it("deducts 25 for a blocked safety verdict", () => {
    const { internalScore } = computeConfidence([result(output())], BASE_INPUT, { verdict: "block" });
    expect(internalScore).toBe(BASE_SCORE - 25);
  });

  it("deducts 10 for a warn safety verdict", () => {
    const { internalScore } = computeConfidence([result(output())], BASE_INPUT, { verdict: "warn" });
    expect(internalScore).toBe(BASE_SCORE - 10);
  });

  it("deducts 5 per missing-information item, capped at 20", () => {
    const twoItems = computeConfidence(
      [result(output({ missingInformation: ["no live data", "no freeze frame"] }))],
      BASE_INPUT,
      { verdict: "pass" },
    );
    expect(twoItems.internalScore).toBe(BASE_SCORE - 10);

    const sixItems = computeConfidence(
      [result(output({ missingInformation: Array(6).fill("missing item") }))],
      BASE_INPUT,
      { verdict: "pass" },
    );
    expect(sixItems.internalScore).toBe(BASE_SCORE - 20); // capped, not -30
  });

  it("clamps to the minimum of 10 when many deductions stack", () => {
    const { internalScore, rationale } = computeConfidence(
      [result(output({ missingInformation: Array(6).fill("x") }))],
      { ...BASE_INPUT, vehicle: {}, complaint: null, symptoms: [], imageOnlyPdf: true, extractionWarnings: ["w"] },
      { verdict: "block" },
    );
    expect(internalScore).toBe(10);
    expect(rationale.some((r) => /Clamped/.test(r))).toBe(true);
  });

  it("clamps to the maximum of 95 and never reports full certainty, even for a well-corroborated agreeing case", () => {
    const agreeingResults = [result(output()), result(output())];
    const { internalScore, rationale } = computeConfidence(agreeingResults, RICH_INPUT, { verdict: "pass" });
    expect(internalScore).toBe(95);
    expect(rationale.some((r) => /Clamped/.test(r))).toBe(true);
  });

  it("uses a lower base when multiple providers disagree on the top cause", () => {
    const disagreeing = [
      result(output()),
      result(
        output({
          rankedCauses: [
            {
              cause: "Failed O2 sensor",
              confidenceLevel: "medium",
              complaintCorrelation: "unknown",
              rationale: "r",
              supportingEvidence: [],
              contradictingEvidence: [],
              confirmationTestsRequired: [],
            },
          ],
        }),
      ),
    ];
    const { internalScore } = computeConfidence(disagreeing, BASE_INPUT, { verdict: "pass" });
    expect(internalScore).toBe(55 - 18);
  });
});

describe("computeConfidence — categorical confidenceLevel (what the UI/API actually surface)", () => {
  it("bands a clean single-provider case as medium, not high", () => {
    const { confidenceLevel } = computeConfidence([result(output())], BASE_INPUT, { verdict: "pass" });
    expect(confidenceLevel).toBe("medium");
  });

  it("bands independently-agreeing, well-corroborated multi-provider consensus as high", () => {
    const { confidenceLevel } = computeConfidence([result(output()), result(output())], RICH_INPUT, {
      verdict: "pass",
    });
    expect(confidenceLevel).toBe("high");
  });

  it("bands a heavily-deducted case (score 10) as insufficient_evidence", () => {
    const { confidenceLevel } = computeConfidence(
      [result(output({ missingInformation: Array(6).fill("x") }))],
      { ...BASE_INPUT, vehicle: {}, complaint: null, symptoms: [], imageOnlyPdf: true, extractionWarnings: ["w"] },
      { verdict: "block" },
    );
    expect(confidenceLevel).toBe("insufficient_evidence");
  });

  it("never returns a numerical field as part of confidenceLevel — only one of the four fixed labels", () => {
    const { confidenceLevel } = computeConfidence([result(output())], BASE_INPUT, { verdict: "pass" });
    expect(["high", "medium", "low", "insufficient_evidence"]).toContain(confidenceLevel);
  });
});

describe("sanitizeMissingInformation", () => {
  it("strips a false 'no customer complaint was provided' claim when the complaint is actually populated", () => {
    const { sanitized, removed } = sanitizeMissingInformation(
      ["No customer complaint was provided.", "No live data available."],
      { complaint: "Vehicle does not start", symptoms: [] },
    );
    expect(sanitized).toEqual(["No live data available."]);
    expect(removed).toEqual(["No customer complaint was provided."]);
  });

  it("strips a false 'no symptoms were supplied' claim when symptoms are actually populated", () => {
    const { sanitized, removed } = sanitizeMissingInformation(
      ["No symptoms were supplied.", "No freeze frame data."],
      { complaint: null, symptoms: ["Starter does not crank"] },
    );
    expect(sanitized).toEqual(["No freeze frame data."]);
    expect(removed).toEqual(["No symptoms were supplied."]);
  });

  it("leaves a genuine 'no complaint provided' claim intact when the complaint really is empty", () => {
    const { sanitized, removed } = sanitizeMissingInformation(["No customer complaint was provided."], {
      complaint: null,
      symptoms: [],
    });
    expect(sanitized).toEqual(["No customer complaint was provided."]);
    expect(removed).toEqual([]);
  });

  it("leaves a genuine 'no complaint provided' claim intact when the complaint is only whitespace", () => {
    const { sanitized, removed } = sanitizeMissingInformation(["No customer complaint was provided."], {
      complaint: "   ",
      symptoms: [],
    });
    expect(sanitized).toEqual(["No customer complaint was provided."]);
    expect(removed).toEqual([]);
  });

  it("never touches unrelated missing-information items", () => {
    const items = ["No VIN provided.", "No live data available.", "Freeze frame not captured."];
    const { sanitized, removed } = sanitizeMissingInformation(items, {
      complaint: "Vehicle does not start",
      symptoms: ["No crank"],
    });
    expect(sanitized).toEqual(items);
    expect(removed).toEqual([]);
  });

  it("is narrow enough not to strip an item that merely mentions 'complaint' without claiming it's missing", () => {
    const items = ["The complaint description does not mention any prior repair attempts."];
    const { sanitized, removed } = sanitizeMissingInformation(items, {
      complaint: "Vehicle does not start",
      symptoms: [],
    });
    expect(sanitized).toEqual(items);
    expect(removed).toEqual([]);
  });
});
