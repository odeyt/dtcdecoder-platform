import { describe, expect, it } from "vitest";
import { buildTestPlan } from "@/lib/diagnostic-engine/test-planner";
import type { DiagnosticAiOutput } from "@/lib/scan-diagnostics/schemas";
import type { RankedHypothesis } from "@/lib/diagnostic-engine/types";

function output(recommendedTests: DiagnosticAiOutput["recommendedTests"]): DiagnosticAiOutput {
  return { summary: "s", rankedCauses: [], recommendedTests, safetyWarnings: [], missingInformation: [] } as unknown as DiagnosticAiOutput;
}

describe("buildTestPlan", () => {
  it("derives difficulty/risk/cost from the test step's own text via keyword rules", () => {
    const plan = buildTestPlan(
      output([
        { step: "Visual inspection of the ground strap connector", purpose: "Look for corrosion", expectedResult: "Clean, tight connection" },
        { step: "Oscilloscope test of the crank sensor signal", purpose: "Confirm signal pattern", expectedResult: "Clean sine wave" },
      ]),
      [],
    );
    const visual = plan.find((t) => t.step.includes("Visual"));
    const scope = plan.find((t) => t.step.includes("Oscilloscope"));
    expect(visual?.difficulty).toBe("easy");
    expect(visual?.costLevel).toBe("low");
    expect(scope?.difficulty).toBe("professional");
    expect(scope?.costLevel).toBe("high");
  });

  it("links a test to a hypothesis when the hypothesis's own requiredTests names it", () => {
    const hypotheses: RankedHypothesis[] = [
      { rank: 1, hypothesis: "Open ground G103", confidenceLevel: "high", reasoning: "r", evidenceStrength: "strong", supportingEvidenceIds: [], missingEvidence: [], requiredTests: ["Ohm test ground strap"] },
    ];
    const plan = buildTestPlan(output([{ step: "Ohm test ground strap", purpose: "Confirm ground integrity", expectedResult: "<0.1 ohm" }]), hypotheses);
    expect(plan[0].relatedHypothesisRanks).toEqual([1]);
  });

  it("ranks a test tied to a high-confidence hypothesis above one tied to a lower-confidence hypothesis", () => {
    const hypotheses: RankedHypothesis[] = [
      { rank: 1, hypothesis: "Open ground", confidenceLevel: "high", reasoning: "r", evidenceStrength: "strong", supportingEvidenceIds: [], missingEvidence: [], requiredTests: ["Ohm test ground strap"] },
      { rank: 2, hypothesis: "Crank sensor fault", confidenceLevel: "low", reasoning: "r", evidenceStrength: "weak", supportingEvidenceIds: [], missingEvidence: [], requiredTests: ["Scope test crank sensor"] },
    ];
    const plan = buildTestPlan(
      output([
        { step: "Scope test crank sensor", purpose: "Confirm signal", expectedResult: "Clean signal" },
        { step: "Ohm test ground strap", purpose: "Confirm ground integrity", expectedResult: "<0.1 ohm" },
      ]),
      hypotheses,
    );
    expect(plan[0].step).toBe("Ohm test ground strap");
    expect(plan[0].rank).toBe(1);
    expect(plan[1].step).toBe("Scope test crank sensor");
  });

  it("prefers the lower-risk/lower-difficulty test when both relate equally to no hypothesis", () => {
    const plan = buildTestPlan(
      output([
        { step: "High voltage isolation test", purpose: "Confirm isolation", expectedResult: "No continuity to chassis" },
        { step: "Visual inspection of connector", purpose: "Check for corrosion", expectedResult: "Clean" },
      ]),
      [],
    );
    expect(plan[0].step).toBe("Visual inspection of connector");
  });

  it("re-numbers ranks 1..N after sorting", () => {
    const plan = buildTestPlan(
      output([
        { step: "Test A", purpose: "p", expectedResult: "e" },
        { step: "Test B", purpose: "p", expectedResult: "e" },
        { step: "Test C", purpose: "p", expectedResult: "e" },
      ]),
      [],
    );
    expect(plan.map((t) => t.rank)).toEqual([1, 2, 3]);
  });
});
