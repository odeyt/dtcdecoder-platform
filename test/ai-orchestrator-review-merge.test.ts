import { describe, expect, it } from "vitest";
import { applyReviewCorrections } from "@/lib/scan-diagnostics/ai/review-merge";
import type { DiagnosticAiOutput } from "@/lib/scan-diagnostics/schemas";
import type { DiagnosticReview } from "@/lib/scan-diagnostics/ai/review-schema";

const PRIMARY: DiagnosticAiOutput = {
  summary: "Likely a vacuum leak.",
  rankedCauses: [
    {
      cause: "Vacuum leak",
      confidenceLevel: "medium",
      rationale: "Lean condition on bank 1",
      supportingEvidence: [],
      contradictingEvidence: [],
      confirmationTestsRequired: ["Smoke test"],
    },
  ],
  recommendedTests: [{ step: "Smoke test", purpose: "Find leak", expectedResult: "Smoke visible at leak point" }],
  safetyWarnings: [],
  missingInformation: [],
};

function baseReview(overrides: Partial<DiagnosticReview> = {}): DiagnosticReview {
  return {
    decision: "approved_with_changes",
    unsupportedClaims: [],
    missedCauses: [],
    unsafeRecommendations: [],
    testOrderCorrections: [],
    confidenceAdjustment: { original: 60, revised: 55, reason: "test" },
    correctedFields: [],
    reviewerSummary: "Looks reasonable with minor wording fixes.",
    ...overrides,
  };
}

describe("applyReviewCorrections", () => {
  it("applies a valid, allowlisted correction and records original/replacement/reason", () => {
    const review = baseReview({
      correctedFields: [
        { path: "rankedCauses.0.rationale", replacement: "Lean condition on bank 1, confirmed by fuel trim data", reason: "clarified" },
      ],
    });
    const result = applyReviewCorrections(PRIMARY, review);

    expect(result.output.rankedCauses[0].rationale).toBe("Lean condition on bank 1, confirmed by fuel trim data");
    expect(result.appliedCorrections).toHaveLength(1);
    expect(result.appliedCorrections[0].original).toBe(PRIMARY.rankedCauses[0].rationale);
    expect(result.skippedCorrections).toHaveLength(0);
  });

  it("never mutates the original primary output object", () => {
    const review = baseReview({
      correctedFields: [{ path: "summary", replacement: "Different summary", reason: "test" }],
    });
    applyReviewCorrections(PRIMARY, review);
    expect(PRIMARY.summary).toBe("Likely a vacuum leak.");
  });

  it("skips a correction whose path is not on the allowlist", () => {
    const review = baseReview({
      correctedFields: [{ path: "safetyWarnings.0", replacement: "hacked", reason: "test" }],
    });
    const result = applyReviewCorrections(PRIMARY, review);
    expect(result.output.summary).toBe(PRIMARY.summary);
    expect(result.appliedCorrections).toHaveLength(0);
    expect(result.skippedCorrections).toHaveLength(1);
    expect(result.skippedCorrections[0].reason).toMatch(/allowlist/);
  });

  it("skips a correction whose replacement type doesn't match the original field's type", () => {
    const review = baseReview({
      correctedFields: [{ path: "rankedCauses.0.cause", replacement: 12345, reason: "test" }],
    });
    const result = applyReviewCorrections(PRIMARY, review);
    expect(result.output.rankedCauses[0].cause).toBe("Vacuum leak");
    expect(result.skippedCorrections).toHaveLength(1);
  });

  it("skips a confidenceLevel correction whose replacement isn't a valid enum value", () => {
    const review = baseReview({
      correctedFields: [{ path: "rankedCauses.0.confidenceLevel", replacement: "very likely", reason: "test" }],
    });
    const result = applyReviewCorrections(PRIMARY, review);
    expect(result.output.rankedCauses[0].confidenceLevel).toBe("medium");
    expect(result.skippedCorrections).toHaveLength(1);
  });

  it("applies a valid confidenceLevel correction", () => {
    const review = baseReview({
      correctedFields: [{ path: "rankedCauses.0.confidenceLevel", replacement: "low", reason: "insufficient evidence given" }],
    });
    const result = applyReviewCorrections(PRIMARY, review);
    expect(result.output.rankedCauses[0].confidenceLevel).toBe("low");
  });

  it("skips a correction whose path doesn't resolve (out-of-range index)", () => {
    const review = baseReview({
      correctedFields: [{ path: "recommendedTests.5.step", replacement: "Nonexistent", reason: "test" }],
    });
    const result = applyReviewCorrections(PRIMARY, review);
    expect(result.skippedCorrections).toHaveLength(1);
  });
});
