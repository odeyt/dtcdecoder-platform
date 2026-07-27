// Test Planner (docs/PHASE_2_ARCHITECTURE.md#test-planner) — "Instead of
// 'Replace Part,' generate Recommended Diagnostic Tests ranked by Cost,
// Difficulty, Probability, Risk." The AI's own recommendedTests only carry
// step/purpose/expectedResult (DiagnosticAiOutputSchema) — difficulty,
// risk, and cost are deterministically derived here from the test step's
// own text via a conservative keyword lookup, the same style of rule as
// safety.ts's keyword scan, rather than trusting the AI to self-rate its
// own test's difficulty consistently across runs. "Probability" (the spec's
// 4th ranking axis) is not a separate field — it's expressed by linking a
// test to the ranked hypotheses it helps confirm (relatedHypothesisRanks)
// and using the best-linked hypothesis's own categorical confidence as the
// ranking signal, never a fabricated number of its own.
import type { DiagnosticAiOutput, ConfidenceLevel } from "@/lib/scan-diagnostics/schemas";
import type { RankedHypothesis, PlannedTest, TestDifficulty, TestRisk, TestCost } from "@/lib/diagnostic-engine/types";

const DIFFICULTY_KEYWORDS: Array<{ keywords: string[]; difficulty: TestDifficulty }> = [
  { keywords: ["oscilloscope", "scope test", "reprogram", "flash", "module replacement", "calibrat"], difficulty: "professional" },
  { keywords: ["fuel pressure", "compression test", "smoke test", "pinpoint", "wiring diagram", "back-probe", "back probe"], difficulty: "hard" },
  { keywords: ["visual inspection", "check connector", "battery voltage", "check fuse", "inspect ground", "verify connector"], difficulty: "easy" },
];

const RISK_KEYWORDS: Array<{ keywords: string[]; risk: TestRisk }> = [
  { keywords: ["high voltage", "high-voltage", "fuel system pressure", "airbag", "squib"], risk: "high" },
  { keywords: ["disconnect battery", "energize", "load test", "under load", "engine running"], risk: "moderate" },
];

// Shop-time cost tracks difficulty directly — a harder test reliably takes
// longer/needs more specialized equipment, and this app has no independent
// cost model to draw on. A separate cost heuristic would just be a second,
// possibly-inconsistent guess at the same underlying signal.
const DIFFICULTY_TO_COST: Record<TestDifficulty, TestCost> = {
  easy: "low",
  moderate: "moderate",
  hard: "high",
  professional: "high",
};

function deriveDifficulty(text: string): TestDifficulty {
  const lower = text.toLowerCase();
  for (const { keywords, difficulty } of DIFFICULTY_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return difficulty;
  }
  return "moderate";
}

function deriveRisk(text: string): TestRisk {
  const lower = text.toLowerCase();
  for (const { keywords, risk } of RISK_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return risk;
  }
  return "low";
}

// A test is related to a hypothesis when its step text is mentioned
// (conservative substring match, either direction) in that hypothesis's own
// requiredTests list — the same list probability.ts carried through from
// the AI's confirmationTestsRequired for that specific cause.
function findRelatedHypothesisRanks(step: string, hypotheses: RankedHypothesis[]): number[] {
  const lowerStep = step.toLowerCase();
  return hypotheses
    .filter((h) => h.requiredTests.some((rt) => rt.toLowerCase().includes(lowerStep) || lowerStep.includes(rt.toLowerCase())))
    .map((h) => h.rank);
}

const CONFIDENCE_WEIGHT: Record<ConfidenceLevel, number> = { high: 3, medium: 2, low: 1, insufficient_evidence: 0 };
const RISK_PENALTY: Record<TestRisk, number> = { low: 0, moderate: 1, high: 2 };
const DIFFICULTY_PENALTY: Record<TestDifficulty, number> = { easy: 0, moderate: 1, hard: 2, professional: 3 };

function scoreTest(relatedRanks: number[], hypothesesByRank: Map<number, RankedHypothesis>, risk: TestRisk, difficulty: TestDifficulty): number {
  const bestConfidence = Math.max(
    0,
    ...relatedRanks.map((rank) => CONFIDENCE_WEIGHT[hypothesesByRank.get(rank)?.confidenceLevel ?? "insufficient_evidence"]),
  );
  return bestConfidence * 10 - RISK_PENALTY[risk] - DIFFICULTY_PENALTY[difficulty];
}

// Highest-value test first: the test that helps confirm/rule out the
// currently most-confident hypothesis, at the lowest risk and difficulty,
// is what a technician should run next. Ties keep the AI's own original
// ordering (stable sort).
export function buildTestPlan(output: DiagnosticAiOutput, hypotheses: RankedHypothesis[]): PlannedTest[] {
  const hypothesesByRank = new Map(hypotheses.map((h) => [h.rank, h]));

  const withScores = output.recommendedTests.map((test) => {
    const difficulty = deriveDifficulty(`${test.step} ${test.purpose}`);
    const risk = deriveRisk(`${test.step} ${test.purpose}`);
    const relatedHypothesisRanks = findRelatedHypothesisRanks(test.step, hypotheses);
    return {
      step: test.step,
      purpose: test.purpose,
      expectedResult: test.expectedResult,
      difficulty,
      risk,
      costLevel: DIFFICULTY_TO_COST[difficulty],
      relatedHypothesisRanks,
      score: scoreTest(relatedHypothesisRanks, hypothesesByRank, risk, difficulty),
    };
  });

  return withScores
    .map((test, index) => ({ test, originalIndex: index }))
    .sort((a, b) => b.test.score - a.test.score || a.originalIndex - b.originalIndex)
    .map(({ test }, i) => ({
      rank: i + 1,
      step: test.step,
      purpose: test.purpose,
      expectedResult: test.expectedResult,
      difficulty: test.difficulty,
      risk: test.risk,
      costLevel: test.costLevel,
      relatedHypothesisRanks: test.relatedHypothesisRanks,
    }));
}
