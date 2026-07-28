// Phase 2.1 Step 10 — validation harness evaluators
// (docs/DIAGNOSTIC_ENGINE_VALIDATION.md). These check the DETERMINISTIC
// layers of the engine (Question Engine, Safety Engine, Confidence
// Engine's evidence checklist) against each fixture in fixtures.ts,
// without ever calling an AI provider — no assertion here depends on what
// an AI says, only on what the deterministic code around it does with a
// given evidence set. Per the phase brief: "Do not assert that the system
// must identify one exact root cause from insufficient evidence" — these
// evaluators check PROCESS (asks a useful question, applies an
// appropriately cautious safety floor, surfaces missing evidence), not a
// single "correct answer."
import type { EvidenceItem } from "@/lib/diagnostic-engine/types";
import { selectNextQuestion } from "@/lib/diagnostic-engine/question";
import { classifyDriveSafety } from "@/lib/diagnostic-engine/safety";
import { computeEvidenceStrength } from "@/lib/diagnostic-engine/confidence";
import type { ValidationFixture } from "@/lib/diagnostic-engine/validation/fixtures";

let evidenceIdCounter = 0;

export function evidenceFromFixture(fixture: ValidationFixture): EvidenceItem[] {
  return fixture.evidenceSequence.map((item) => {
    evidenceIdCounter += 1;
    return {
      id: `fixture-evidence-${evidenceIdCounter}`,
      caseId: fixture.id,
      type: item.type,
      value: item.value,
      source: "user_reported",
      confidence: item.confidence,
      recordedAt: "1970-01-01T00:00:00Z",
    };
  });
}

export interface NextQuestionEvaluation {
  pass: boolean;
  actualFieldKey: string | null;
  expectedFieldKeys: string[];
}

// "Asks a useful next question": the Question Engine's pick, given only
// this fixture's evidence, must be one of the fixture's own
// expectedHighValueQuestionFieldKeys — never an arbitrary or already-
// redundant one.
export function evaluateNextQuestion(fixture: ValidationFixture): NextQuestionEvaluation {
  const evidence = evidenceFromFixture(fixture);
  const candidate = selectNextQuestion(new Set(), evidence);
  return {
    pass: candidate !== null && fixture.expectedHighValueQuestionFieldKeys.includes(candidate.fieldKey),
    actualFieldKey: candidate?.fieldKey ?? null,
    expectedFieldKeys: fixture.expectedHighValueQuestionFieldKeys,
  };
}

const SAFETY_SEVERITY: Record<string, number> = {
  safe_to_drive: 0,
  drive_with_caution: 1,
  tow_recommended: 2,
  immediate_stop: 3,
};

export interface SafetyFloorEvaluation {
  pass: boolean;
  actualStatus: string;
  floorStatus: string;
}

// "Applies appropriate safety classification": the engine's classification
// from this fixture's evidence ALONE (no AI safety warnings supplied) must
// be at least as cautious as expectedSafetyFloorEvidenceOnly — meeting or
// exceeding it, never falling short. Checked against the evidence-only
// floor, not the full-system expectedSafetyFloor, because reaching the
// latter for several fixture categories currently depends on the AI's own
// safetyWarnings text (see fixtures.ts's field documentation and
// docs/DIAGNOSTIC_ENGINE_VALIDATION.md's findings — this gap is
// deliberately surfaced, not papered over).
export function evaluateSafetyFloor(fixture: ValidationFixture): SafetyFloorEvaluation {
  const evidence = evidenceFromFixture(fixture);
  const classification = classifyDriveSafety(evidence, []);
  return {
    pass: SAFETY_SEVERITY[classification.status] >= SAFETY_SEVERITY[fixture.expectedSafetyFloorEvidenceOnly],
    actualStatus: classification.status,
    floorStatus: fixture.expectedSafetyFloorEvidenceOnly,
  };
}

export interface MissingEvidenceEvaluation {
  pass: boolean;
  missing: string[];
}

// "Identifies missing evidence": every fixture is deliberately partial
// (a real early-stage case, not a fully-resolved one) — the deterministic
// checklist must report at least one missing category, never falsely
// claim completeness.
export function evaluateMissingEvidenceIdentified(fixture: ValidationFixture): MissingEvidenceEvaluation {
  const evidence = evidenceFromFixture(fixture);
  const { missing } = computeEvidenceStrength(evidence);
  return { pass: missing.length > 0, missing };
}

export interface PartsRouletteEvaluation {
  pass: boolean;
  matchedUnacceptable: string[];
}

// "Avoids parts roulette": checks a set of AI-PRODUCED recommendation
// strings (recommended tests, or a hypothesis's own text) against this
// fixture's unacceptableRecommendations — none of them should appear
// verbatim. This one DOES depend on externally-supplied text (from a real
// or synthetic AI run), unlike the evaluators above — see
// docs/DIAGNOSTIC_ENGINE_VALIDATION.md for how to exercise it against a
// real provider run.
export function evaluatePartsRouletteAbsent(fixture: ValidationFixture, producedText: string[]): PartsRouletteEvaluation {
  const joined = producedText.join(" \n ").toLowerCase();
  const matched = fixture.unacceptableRecommendations.filter((pattern) => joined.includes(pattern.toLowerCase()));
  return { pass: matched.length === 0, matchedUnacceptable: matched };
}
