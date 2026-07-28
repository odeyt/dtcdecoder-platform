// Phase 2.2 Step 5 — HV validation fixture evaluator
// (docs/PHASE_2_2_EV_SAFETY_AUDIT.md). Runs classifyDriveSafety against
// each HvValidationFixture's evidence alone (no AI text) and checks it
// lands within the fixture's [minimum, maximum] acceptable range —
// proving both that genuine hazards reach immediate_stop AND that
// non-hazard fixtures (low-voltage, generic comm fault, historical code)
// don't over-trigger past their ceiling.
import type { EvidenceItem, DriveSafetyStatus } from "@/lib/diagnostic-engine/types";
import { classifyDriveSafety, deriveOperationalGuidance } from "@/lib/diagnostic-engine/safety";
import type { HvValidationFixture } from "@/lib/diagnostic-engine/validation/hv-fixtures";

const SEVERITY: Record<DriveSafetyStatus, number> = {
  safe_to_drive: 0,
  drive_with_caution: 1,
  tow_recommended: 2,
  immediate_stop: 3,
};

let hvEvidenceIdCounter = 0;

export function evidenceFromHvFixture(fixture: HvValidationFixture): EvidenceItem[] {
  return fixture.evidenceSequence.map((item) => {
    hvEvidenceIdCounter += 1;
    return {
      id: `hv-fixture-evidence-${hvEvidenceIdCounter}`,
      caseId: fixture.id,
      type: item.type,
      value: item.value,
      source: "derived",
      confidence: item.confidence,
      recordedAt: "1970-01-01T00:00:00Z",
    };
  });
}

export interface HvFixtureEvaluation {
  pass: boolean;
  actualStatus: DriveSafetyStatus;
  withinRange: boolean;
  warningPresent: boolean;
  operationalGuidanceConsistent: boolean;
  reasons: string[];
}

export function evaluateHvFixture(fixture: HvValidationFixture): HvFixtureEvaluation {
  const evidence = evidenceFromHvFixture(fixture);
  const classification = classifyDriveSafety(evidence, []);
  const reasons: string[] = [];

  const withinRange =
    SEVERITY[classification.status] >= SEVERITY[fixture.minimumAcceptableSafety] &&
    SEVERITY[classification.status] <= SEVERITY[fixture.maximumAcceptableSafety];
  if (!withinRange) {
    reasons.push(
      `status "${classification.status}" is outside the acceptable range [${fixture.minimumAcceptableSafety}, ${fixture.maximumAcceptableSafety}]`,
    );
  }

  const combinedText = [classification.reasoning, classification.hvHazard?.hazardCategory ?? ""].join(" ").toLowerCase();
  const warningPresent = fixture.requiredWarningSubstring
    ? combinedText.includes(fixture.requiredWarningSubstring.toLowerCase())
    : true;
  if (!warningPresent) {
    reasons.push(`expected warning text containing "${fixture.requiredWarningSubstring}" was not present`);
  }

  // Operational guidance must be internally consistent with whatever
  // status was actually produced — this is a self-consistency check
  // (deriveOperationalGuidance is a pure function of status), not an
  // independent assertion, but it guards against the guidance function
  // and the classification ever disagreeing after a future edit.
  const guidance = deriveOperationalGuidance(classification.status);
  const operationalGuidanceConsistent =
    classification.status !== "immediate_stop" || (guidance.towingRequired && guidance.hvQualifiedServiceRequired && !guidance.drivingAllowed && !guidance.chargingAllowed);
  if (!operationalGuidanceConsistent) {
    reasons.push("immediate_stop classification did not produce fully restrictive operational guidance");
  }

  return {
    pass: withinRange && warningPresent && operationalGuidanceConsistent,
    actualStatus: classification.status,
    withinRange,
    warningPresent,
    operationalGuidanceConsistent,
    reasons,
  };
}
