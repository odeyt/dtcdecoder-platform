import { describe, expect, it } from "vitest";
import { VALIDATION_FIXTURES } from "@/lib/diagnostic-engine/validation/fixtures";
import {
  evaluateNextQuestion,
  evaluateSafetyFloor,
  evaluateMissingEvidenceIdentified,
  evaluatePartsRouletteAbsent,
} from "@/lib/diagnostic-engine/validation/evaluate";

describe("diagnostic engine validation harness", () => {
  it("covers all 10 required fixture categories", () => {
    expect(VALIDATION_FIXTURES).toHaveLength(10);
    const categories = new Set(VALIDATION_FIXTURES.map((f) => f.category));
    expect(categories.size).toBe(10);
  });

  for (const fixture of VALIDATION_FIXTURES) {
    describe(fixture.category, () => {
      it("asks a useful next question from this fixture's evidence alone", () => {
        const result = evaluateNextQuestion(fixture);
        expect(result.pass, `expected one of [${result.expectedFieldKeys.join(", ")}], got "${result.actualFieldKey}"`).toBe(true);
      });

      it("applies at least the expected safety floor", () => {
        const result = evaluateSafetyFloor(fixture);
        expect(result.pass, `expected at least "${result.floorStatus}", got "${result.actualStatus}"`).toBe(true);
      });

      it("identifies missing evidence rather than claiming completeness", () => {
        const result = evaluateMissingEvidenceIdentified(fixture);
        expect(result.pass, `expected non-empty missing-evidence list, got none`).toBe(true);
      });

      it("would flag this fixture's own unacceptable recommendations if they appeared", () => {
        // Sanity-checks the evaluator itself: feeding it exactly the
        // fixture's unacceptable text must fail, and feeding it the
        // fixture's expected (acceptable) tests must pass — proving the
        // matcher actually discriminates rather than always passing.
        const failing = evaluatePartsRouletteAbsent(fixture, fixture.unacceptableRecommendations);
        expect(failing.pass).toBe(false);

        const passing = evaluatePartsRouletteAbsent(fixture, fixture.expectedUsefulTests);
        expect(passing.pass).toBe(true);
      });
    });
  }
});
