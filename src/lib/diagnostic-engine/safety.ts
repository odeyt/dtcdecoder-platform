// Safety Engine (docs/PHASE_2_ARCHITECTURE.md#safety-engine) — "Every case
// must classify Safe to Drive / Drive with Caution / Tow Recommended /
// Immediate Stop, with explanation." Classification is deterministic
// keyword/evidence rules, not an AI judgment call — the same
// rule-engine-over-structured-facts approach already used for
// docs/DIAGNOSTIC_SAFETY_RULES.md's comm-code replacement guard
// (src/lib/scan-diagnostics/safety-rules.ts).
//
// Phase 2.2 (docs/PHASE_2_2_EV_SAFETY_AUDIT.md) rewrite: classification is
// now the MORE SEVERE of two independently-computed signals —
// evidence-only (deterministic, computable with zero AI involvement) and
// AI-text-derived (the existing keyword scan over safetyWarnings). Never
// the AI-text signal alone. This is the "severity precedence" model the
// audit called for: once evidence alone establishes a floor, AI-generated
// text can only ever raise the final classification, never lower it —
// there is no code path where the AI-text branch can override a higher
// evidence-derived result.
import type { EvidenceItem, DriveSafetyClassification, DriveSafetyStatus, HvHazardDetail } from "@/lib/diagnostic-engine/types";
import { HV_HAZARD_LABELS, type HvHazardCategory } from "@/lib/diagnostic-engine/hv-hazard-keywords";

const IMMEDIATE_STOP_KEYWORDS = [
  "do not drive",
  "stop driving immediately",
  "fire risk",
  "risk of fire",
  "brake failure",
  "loss of braking",
  "loss of steering",
  "steering failure",
  "immediate stop",
];

const TOW_RECOMMENDED_KEYWORDS = ["tow", "do not start", "no-start", "will not start", "engine will not start"];

const CAUTION_KEYWORDS = [
  "caution",
  "limited power",
  "reduced power",
  "limp mode",
  "intermittent stall",
  "may stall",
  "check engine",
];

const SEVERITY: Record<DriveSafetyStatus, number> = {
  safe_to_drive: 0,
  drive_with_caution: 1,
  tow_recommended: 2,
  immediate_stop: 3,
};

function matchesAny(text: string, keywords: string[]): string | null {
  const lower = text.toLowerCase();
  return keywords.find((k) => lower.includes(k)) ?? null;
}

function scanWarnings(safetyWarnings: string[], keywords: string[]): { warning: string; keyword: string } | null {
  for (const warning of safetyWarnings) {
    const keyword = matchesAny(warning, keywords);
    if (keyword) return { warning, keyword };
  }
  return null;
}

function classification(status: DriveSafetyStatus, reasoning: string, hvHazard?: HvHazardDetail): DriveSafetyClassification {
  return hvHazard ? { status, reasoning, hvHazard } : { status, reasoning };
}

function buildHvHazardDetail(category: HvHazardCategory): HvHazardDetail {
  return {
    hazardCategory: category,
    immediateAction: "Switch the vehicle off and prevent further driving or charging until inspected.",
    prohibitedActions: [
      "Do not touch orange high-voltage cables or connectors.",
      "Do not open the high-voltage battery enclosure.",
      "Do not attempt to charge the vehicle.",
    ],
    requiredQualification: "A technician qualified and certified for high-voltage/EV service.",
    isolationRecommended: true,
    towingRecommended: true,
    ppeWarning: "High-voltage-rated PPE (insulated gloves, tools, and eyewear) is required before any inspection.",
    manufacturerProcedureWarning:
      "Follow the manufacturer's approved high-voltage isolation and towing procedure — do not improvise a shutdown or disconnect sequence.",
  };
}

// Evidence-only floor — zero dependency on AI-generated text. This is the
// part of the classification that can never be weakened by what a
// provider happens to say (or fail to say) on any given turn.
function classifyFromEvidenceAlone(evidence: EvidenceItem[]): DriveSafetyClassification {
  const hvHazardEvidence = evidence.find((item) => item.type === "hv_safety_hazard");
  if (hvHazardEvidence) {
    const value = hvHazardEvidence.value as { hazardCategory?: HvHazardCategory } | undefined;
    const category = value?.hazardCategory ?? "hv_isolation_fault";
    const label = HV_HAZARD_LABELS[category] ?? "Possible high-voltage hazard";
    return classification(
      "immediate_stop",
      `Deterministic high-voltage safety rule: ${label.toLowerCase()}. This classification is evidence-derived and cannot be lowered by AI-generated text.`,
      buildHvHazardDetail(category),
    );
  }

  const safetyIssueEvidence = evidence.filter((item) => item.type === "safety_issue");
  if (safetyIssueEvidence.length > 0) {
    return classification(
      "drive_with_caution",
      `${safetyIssueEvidence.length} safety-relevant DTC(s) are present on this case — drive with caution until confirmed safe.`,
    );
  }

  return classification("safe_to_drive", "No safety-relevant evidence was identified for this case.");
}

// AI-text-derived signal only — the existing keyword scan, unchanged in
// behavior from before this rewrite.
function classifyFromWarningsAlone(safetyWarnings: string[]): DriveSafetyClassification {
  const immediateStop = scanWarnings(safetyWarnings, IMMEDIATE_STOP_KEYWORDS);
  if (immediateStop) {
    return classification(
      "immediate_stop",
      `A reported safety warning matches an immediate-stop condition ("${immediateStop.warning}").`,
    );
  }

  const towRecommended = scanWarnings(safetyWarnings, TOW_RECOMMENDED_KEYWORDS);
  if (towRecommended) {
    return classification(
      "tow_recommended",
      `A reported safety warning indicates the vehicle should not be driven ("${towRecommended.warning}").`,
    );
  }

  const caution = scanWarnings(safetyWarnings, CAUTION_KEYWORDS);
  if (caution) {
    return classification("drive_with_caution", `A reported safety warning suggests caution ("${caution.warning}").`);
  }

  if (safetyWarnings.length > 0) {
    return classification("drive_with_caution", `The assessment reported ${safetyWarnings.length} safety warning(s) that do not match a more specific rule.`);
  }

  return classification("safe_to_drive", "No safety warnings were reported.");
}

// Severity precedence (docs/PHASE_2_2_EV_SAFETY_AUDIT.md): the FINAL
// classification is whichever of the two signals is more severe. A
// provider's text can raise the result above the evidence floor (it may
// know things evidence alone doesn't capture) but can never lower it below
// what evidence alone already established — there is no branch here that
// picks the AI-text result when it is LESS severe than the evidence floor.
export function classifyDriveSafety(evidence: EvidenceItem[], safetyWarnings: string[]): DriveSafetyClassification {
  const evidenceFloor = classifyFromEvidenceAlone(evidence);
  const warningsSignal = classifyFromWarningsAlone(safetyWarnings);

  if (SEVERITY[warningsSignal.status] > SEVERITY[evidenceFloor.status]) {
    // AI text raised it further than evidence alone — keep the
    // evidence-derived hvHazard detail if the evidence floor had one,
    // since that structured detail is only ever evidence-derived.
    return evidenceFloor.hvHazard ? { ...warningsSignal, hvHazard: evidenceFloor.hvHazard } : warningsSignal;
  }
  return evidenceFloor;
}

export interface OperationalGuidance {
  drivingAllowed: boolean;
  chargingAllowed: boolean;
  towingRequired: boolean;
  hvQualifiedServiceRequired: boolean;
}

// Phase 2.2 Step 5 (docs/PHASE_2_2_EV_SAFETY_AUDIT.md) — a single,
// documented mapping from safety status to operational guidance, used by
// the validation harness's HV fixtures so 12 fixtures' worth of
// driving/charging/towing/service flags never have to be hand-typed (and
// potentially drift out of consistency with each other) — they're derived
// from the SAME classification the Safety Engine itself produces.
export function deriveOperationalGuidance(status: DriveSafetyStatus): OperationalGuidance {
  switch (status) {
    case "immediate_stop":
      return { drivingAllowed: false, chargingAllowed: false, towingRequired: true, hvQualifiedServiceRequired: true };
    case "tow_recommended":
      return { drivingAllowed: false, chargingAllowed: false, towingRequired: true, hvQualifiedServiceRequired: false };
    case "drive_with_caution":
      return { drivingAllowed: true, chargingAllowed: true, towingRequired: false, hvQualifiedServiceRequired: false };
    case "safe_to_drive":
      return { drivingAllowed: true, chargingAllowed: true, towingRequired: false, hvQualifiedServiceRequired: false };
  }
}
