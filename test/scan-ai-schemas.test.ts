import { describe, expect, it } from "vitest";
import { DiagnosticAiOutputSchema, CanonicalDiagnosticInputSchema } from "@/lib/scan-diagnostics/schemas";
import { classifyDtcCategories } from "@/lib/scan-diagnostics/parsers/category-classification";

const VALID_OUTPUT = {
  summary: "Likely a vacuum leak causing a lean condition.",
  rankedCauses: [
    {
      cause: "Vacuum leak at intake manifold gasket",
      confidenceLevel: "medium",
      rationale: "P0171 lean code with rough idle matches a common vacuum leak pattern.",
      supportingEvidence: ["P0171 present", "Rough idle reported"],
      contradictingEvidence: [],
      confirmationTestsRequired: ["Smoke test intake system"],
    },
  ],
  recommendedTests: [
    { step: "Smoke test intake system", purpose: "Locate the leak source", expectedResult: "Smoke escaping at leak point" },
  ],
  safetyWarnings: [],
  missingInformation: ["No live fuel trim data provided"],
};

describe("DiagnosticAiOutputSchema", () => {
  it("accepts a well-formed AI response", () => {
    expect(DiagnosticAiOutputSchema.safeParse(VALID_OUTPUT).success).toBe(true);
  });

  it("rejects a response missing rankedCauses (would otherwise be passed through as free text)", () => {
    const { rankedCauses, ...withoutCauses } = VALID_OUTPUT;
    void rankedCauses;
    expect(DiagnosticAiOutputSchema.safeParse(withoutCauses).success).toBe(false);
  });

  it("rejects an empty rankedCauses array", () => {
    expect(DiagnosticAiOutputSchema.safeParse({ ...VALID_OUTPUT, rankedCauses: [] }).success).toBe(false);
  });

  it("rejects a numerical probabilityPercent field — confidenceLevel is the only accepted shape", () => {
    const invalid = {
      ...VALID_OUTPUT,
      rankedCauses: [
        {
          cause: "Vacuum leak at intake manifold gasket",
          probabilityPercent: 60,
          rationale: "r",
          supportingEvidence: [],
          contradictingEvidence: [],
        },
      ],
    };
    expect(DiagnosticAiOutputSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects an invalid confidenceLevel value (not one of the four fixed labels)", () => {
    const invalid = {
      ...VALID_OUTPUT,
      rankedCauses: [{ ...VALID_OUTPUT.rankedCauses[0], confidenceLevel: "very high" }],
    };
    expect(DiagnosticAiOutputSchema.safeParse(invalid).success).toBe(false);
  });

  it("accepts every one of the four fixed confidence levels", () => {
    for (const level of ["high", "medium", "low", "insufficient_evidence"]) {
      const candidate = {
        ...VALID_OUTPUT,
        rankedCauses: [{ ...VALID_OUTPUT.rankedCauses[0], confidenceLevel: level }],
      };
      expect(DiagnosticAiOutputSchema.safeParse(candidate).success).toBe(true);
    }
  });

  it("rejects a plain-text-only response shape", () => {
    expect(DiagnosticAiOutputSchema.safeParse({ text: "The problem is probably the O2 sensor." }).success).toBe(
      false,
    );
  });
});

describe("CanonicalDiagnosticInputSchema", () => {
  it("accepts a minimal input with no VIN, symptoms, or DTCs", () => {
    const minimal = {
      caseId: "case-1",
      vehicle: {},
      symptoms: [],
      modules: [],
      dtcs: [],
      freezeFrame: [],
      liveData: [],
      imageOnlyPdf: false,
      extractionWarnings: [],
      dtcCategoryClassification: classifyDtcCategories([], []),
    };
    expect(CanonicalDiagnosticInputSchema.safeParse(minimal).success).toBe(true);
  });

  it("rejects a malformed DTC entry missing the required code field", () => {
    const invalid = {
      caseId: "case-1",
      vehicle: {},
      symptoms: [],
      modules: [],
      dtcs: [{ module: "ECM" }],
      freezeFrame: [],
      liveData: [],
      imageOnlyPdf: false,
      extractionWarnings: [],
      dtcCategoryClassification: classifyDtcCategories([], []),
    };
    expect(CanonicalDiagnosticInputSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects an input missing the dtcCategoryClassification field entirely", () => {
    const invalid = {
      caseId: "case-1",
      vehicle: {},
      symptoms: [],
      modules: [],
      dtcs: [],
      freezeFrame: [],
      liveData: [],
      imageOnlyPdf: false,
      extractionWarnings: [],
    };
    expect(CanonicalDiagnosticInputSchema.safeParse(invalid).success).toBe(false);
  });
});
