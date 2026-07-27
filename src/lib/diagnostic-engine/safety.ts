// Safety Engine (docs/PHASE_2_ARCHITECTURE.md#safety-engine) — "Every case
// must classify Safe to Drive / Drive with Caution / Tow Recommended /
// Immediate Stop, with explanation." Classification is deterministic
// keyword/evidence rules, not an AI judgment call — the same
// rule-engine-over-structured-facts approach already used for
// docs/DIAGNOSTIC_SAFETY_RULES.md's comm-code replacement guard
// (src/lib/scan-diagnostics/safety-rules.ts). The AI's own free-text
// safetyWarnings are used only as an additional signal (keyword scan), not
// as the sole source of truth — a case can be flagged drive_with_caution
// purely from having safety_issue evidence even if the AI wrote nothing
// alarming.
import type { EvidenceItem, DriveSafetyClassification, DriveSafetyStatus } from "@/lib/diagnostic-engine/types";

// Ordered most-severe first — the first matching rule wins. Keyword lists
// are intentionally conservative/literal (substring match on lowercased
// text) rather than fuzzy, matching this app's established
// "never guess at severity" stance.
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

function classification(status: DriveSafetyStatus, reasoning: string): DriveSafetyClassification {
  return { status, reasoning };
}

export function classifyDriveSafety(evidence: EvidenceItem[], safetyWarnings: string[]): DriveSafetyClassification {
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

  const safetyIssueEvidence = evidence.filter((item) => item.type === "safety_issue");
  if (safetyIssueEvidence.length > 0) {
    return classification(
      "drive_with_caution",
      `${safetyIssueEvidence.length} safety-relevant DTC(s) are present on this case — drive with caution until confirmed safe.`,
    );
  }

  const caution = scanWarnings(safetyWarnings, CAUTION_KEYWORDS);
  if (caution) {
    return classification("drive_with_caution", `A reported safety warning suggests caution ("${caution.warning}").`);
  }

  if (safetyWarnings.length > 0) {
    return classification("drive_with_caution", `The assessment reported ${safetyWarnings.length} safety warning(s) that do not match a more specific rule.`);
  }

  return classification("safe_to_drive", "No safety-relevant evidence or warnings were identified for this case.");
}
