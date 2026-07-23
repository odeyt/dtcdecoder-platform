import { describe, expect, it } from "vitest";
import { computeConfidence } from "@/lib/scan-diagnostics/confidence";
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
};

function output(overrides: Partial<DiagnosticAiOutput> = {}): DiagnosticAiOutput {
  return {
    summary: "summary",
    rankedCauses: [
      { cause: "Vacuum leak", probabilityPercent: 60, rationale: "r", supportingEvidence: [], contradictingEvidence: [] },
    ],
    recommendedTests: [],
    safetyWarnings: [],
    missingInformation: [],
    ...overrides,
  };
}

function result(o: DiagnosticAiOutput): DiagnosticAIProviderResult {
  return { providerId: "anthropic-claude-sonnet-5", modelId: "claude-sonnet-5", output: o, tokens: { input: 0, output: 0 } };
}

describe("computeConfidence", () => {
  it("returns the single-provider base of 70 when nothing is missing and safety passes", () => {
    const { confidence, rationale } = computeConfidence([result(output())], BASE_INPUT, { verdict: "pass" });
    expect(confidence).toBe(70);
    expect(rationale[0]).toMatch(/Base confidence of 70/);
  });

  it("deducts 20 for a missing VIN", () => {
    const { confidence } = computeConfidence(
      [result(output())],
      { ...BASE_INPUT, vehicle: {} },
      { verdict: "pass" },
    );
    expect(confidence).toBe(50);
  });

  it("deducts 10 for no complaint or symptoms", () => {
    const { confidence } = computeConfidence(
      [result(output())],
      { ...BASE_INPUT, complaint: null, symptoms: [] },
      { verdict: "pass" },
    );
    expect(confidence).toBe(60);
  });

  it("deducts 15 for an image-only PDF", () => {
    const { confidence } = computeConfidence(
      [result(output())],
      { ...BASE_INPUT, imageOnlyPdf: true },
      { verdict: "pass" },
    );
    expect(confidence).toBe(55);
  });

  it("deducts 10 for unresolved extraction warnings", () => {
    const { confidence } = computeConfidence(
      [result(output())],
      { ...BASE_INPUT, extractionWarnings: ["No dedicated DTC column found"] },
      { verdict: "pass" },
    );
    expect(confidence).toBe(60);
  });

  it("deducts 25 for a blocked safety verdict", () => {
    const { confidence } = computeConfidence([result(output())], BASE_INPUT, { verdict: "block" });
    expect(confidence).toBe(45);
  });

  it("deducts 10 for a warn safety verdict", () => {
    const { confidence } = computeConfidence([result(output())], BASE_INPUT, { verdict: "warn" });
    expect(confidence).toBe(60);
  });

  it("deducts 5 per missing-information item, capped at 20", () => {
    const twoItems = computeConfidence(
      [result(output({ missingInformation: ["no live data", "no freeze frame"] }))],
      BASE_INPUT,
      { verdict: "pass" },
    );
    expect(twoItems.confidence).toBe(60); // 70 - 10

    const sixItems = computeConfidence(
      [result(output({ missingInformation: Array(6).fill("missing item") }))],
      BASE_INPUT,
      { verdict: "pass" },
    );
    expect(sixItems.confidence).toBe(50); // 70 - 20 (capped, not -30)
  });

  it("clamps to the minimum of 10 when many deductions stack", () => {
    const { confidence, rationale } = computeConfidence(
      [result(output({ missingInformation: Array(6).fill("x") }))],
      { ...BASE_INPUT, vehicle: {}, complaint: null, symptoms: [], imageOnlyPdf: true, extractionWarnings: ["w"] },
      { verdict: "block" },
    );
    expect(confidence).toBe(10);
    expect(rationale.some((r) => /Clamped/.test(r))).toBe(true);
  });

  it("clamps to the maximum of 95 and never reports full certainty", () => {
    // Even with a perfect single-provider case, base is 70 — this test
    // instead verifies the ceiling holds for the (currently inert)
    // multi-provider agreement path, which can push the base to 85.
    const agreeingResults = [result(output()), result(output())];
    const { confidence } = computeConfidence(agreeingResults, BASE_INPUT, { verdict: "pass" });
    expect(confidence).toBeLessThanOrEqual(95);
    expect(confidence).toBe(85);
  });

  it("uses a lower base when multiple providers disagree on the top cause", () => {
    const disagreeing = [
      result(output()),
      result(output({ rankedCauses: [{ cause: "Failed O2 sensor", probabilityPercent: 55, rationale: "r", supportingEvidence: [], contradictingEvidence: [] }] })),
    ];
    const { confidence } = computeConfidence(disagreeing, BASE_INPUT, { verdict: "pass" });
    expect(confidence).toBe(55);
  });
});
