import { describe, expect, it } from "vitest";
import { computeConfidence } from "@/lib/scan-diagnostics/confidence";
import { classifyDtcCategories } from "@/lib/scan-diagnostics/parsers/category-classification";
import type { CanonicalDiagnosticInput, DiagnosticAiOutput } from "@/lib/scan-diagnostics/schemas";
import type { DiagnosticAIProviderResult } from "@/lib/scan-diagnostics/ai/provider";

const BASE_INPUT: CanonicalDiagnosticInput = {
  caseId: "case-1",
  vehicle: { vin: "1FTFW1ET1EFA00001" },
  complaint: "Check engine light on",
  symptoms: ["rough idle"],
  modules: [],
  dtcs: [],
  freezeFrame: [],
  liveData: [],
  imageOnlyPdf: false,
  extractionWarnings: [],
  dtcCategoryClassification: classifyDtcCategories([], []),
};

function output(overrides: Partial<DiagnosticAiOutput> = {}): DiagnosticAiOutput {
  return {
    summary: "summary",
    rankedCauses: [
      {
        cause: "Vacuum leak",
        confidenceLevel: "medium",
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
  it("returns the single-provider base of 70 when nothing is missing and safety passes", () => {
    const { internalScore, rationale } = computeConfidence([result(output())], BASE_INPUT, { verdict: "pass" });
    expect(internalScore).toBe(70);
    expect(rationale[0]).toMatch(/Base confidence of 70/);
  });

  it("deducts 20 for a missing VIN", () => {
    const { internalScore } = computeConfidence(
      [result(output())],
      { ...BASE_INPUT, vehicle: {} },
      { verdict: "pass" },
    );
    expect(internalScore).toBe(50);
  });

  it("deducts 10 for no complaint or symptoms", () => {
    const { internalScore } = computeConfidence(
      [result(output())],
      { ...BASE_INPUT, complaint: null, symptoms: [] },
      { verdict: "pass" },
    );
    expect(internalScore).toBe(60);
  });

  it("deducts 15 for an image-only PDF", () => {
    const { internalScore } = computeConfidence(
      [result(output())],
      { ...BASE_INPUT, imageOnlyPdf: true },
      { verdict: "pass" },
    );
    expect(internalScore).toBe(55);
  });

  it("deducts 10 for unresolved extraction warnings", () => {
    const { internalScore } = computeConfidence(
      [result(output())],
      { ...BASE_INPUT, extractionWarnings: ["No dedicated DTC column found"] },
      { verdict: "pass" },
    );
    expect(internalScore).toBe(60);
  });

  it("deducts 25 for a blocked safety verdict", () => {
    const { internalScore } = computeConfidence([result(output())], BASE_INPUT, { verdict: "block" });
    expect(internalScore).toBe(45);
  });

  it("deducts 10 for a warn safety verdict", () => {
    const { internalScore } = computeConfidence([result(output())], BASE_INPUT, { verdict: "warn" });
    expect(internalScore).toBe(60);
  });

  it("deducts 5 per missing-information item, capped at 20", () => {
    const twoItems = computeConfidence(
      [result(output({ missingInformation: ["no live data", "no freeze frame"] }))],
      BASE_INPUT,
      { verdict: "pass" },
    );
    expect(twoItems.internalScore).toBe(60); // 70 - 10

    const sixItems = computeConfidence(
      [result(output({ missingInformation: Array(6).fill("missing item") }))],
      BASE_INPUT,
      { verdict: "pass" },
    );
    expect(sixItems.internalScore).toBe(50); // 70 - 20 (capped, not -30)
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

  it("clamps to the maximum of 95 and never reports full certainty", () => {
    const agreeingResults = [result(output()), result(output())];
    const { internalScore } = computeConfidence(agreeingResults, BASE_INPUT, { verdict: "pass" });
    expect(internalScore).toBeLessThanOrEqual(95);
    expect(internalScore).toBe(85);
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
    expect(internalScore).toBe(55);
  });
});

describe("computeConfidence — categorical confidenceLevel (what the UI/API actually surface)", () => {
  it("bands a clean single-provider case (score 70) as medium, not high", () => {
    const { confidenceLevel } = computeConfidence([result(output())], BASE_INPUT, { verdict: "pass" });
    expect(confidenceLevel).toBe("medium");
  });

  it("bands independently-agreeing multi-provider consensus (score 85) as high", () => {
    const { confidenceLevel } = computeConfidence([result(output()), result(output())], BASE_INPUT, {
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
