// Confidence Engine (docs/PROBABILITY_ENGINE.md#confidence-engine) —
// case-level "Overall Confidence / Evidence Strength / Missing Evidence /
// Required Tests" breakdown from the phase brief's section 5. Overall
// confidence is categorical (reuses the top-ranked hypothesis's
// ConfidenceLevel — see probability.ts for why this is categorical, not a
// numerical percentage). Evidence-present/missing is a fully deterministic
// checklist over which EvidenceType categories this case actually has —
// no AI call, no guessing.
import type { ConfidenceLevel } from "@/lib/scan-diagnostics/schemas";
import type { EvidenceItem, EvidenceType, RankedHypothesis } from "@/lib/diagnostic-engine/types";

export interface DiagnosticEngineConfidence {
  overallConfidenceLevel: ConfidenceLevel;
  evidencePresent: string[];
  evidenceMissing: string[];
  requiredTests: string[];
}

// The checklist of evidence categories a thorough diagnostic case
// benefits from — not exhaustive, but the same set of categories this
// app's evidence taxonomy (migration 0031) already tracks. Extend this
// list as new evidence types prove useful; never silently invent an
// evidence category not backed by a real EvidenceType.
const EVIDENCE_CHECKLIST: Array<{ type: EvidenceType; label: string }> = [
  { type: "dtc_stored", label: "DTC" },
  { type: "freeze_frame", label: "Freeze Frame" },
  { type: "live_data", label: "Live Data" },
  { type: "symptom", label: "Symptoms" },
  { type: "previous_repair", label: "Repair History" },
  { type: "vehicle", label: "Vehicle Identification" },
];

export function computeEvidenceStrength(evidence: EvidenceItem[]): { present: string[]; missing: string[] } {
  const presentTypes = new Set(evidence.map((e) => e.type));
  const present: string[] = [];
  const missing: string[] = [];
  for (const { type, label } of EVIDENCE_CHECKLIST) {
    (presentTypes.has(type) ? present : missing).push(label);
  }
  return { present, missing };
}

export function computeEngineConfidence(
  hypotheses: RankedHypothesis[],
  evidence: EvidenceItem[],
): DiagnosticEngineConfidence {
  const { present, missing } = computeEvidenceStrength(evidence);
  const requiredTests = [...new Set(hypotheses.flatMap((h) => h.requiredTests))];

  return {
    overallConfidenceLevel: hypotheses[0]?.confidenceLevel ?? "insufficient_evidence",
    evidencePresent: present,
    evidenceMissing: missing,
    requiredTests,
  };
}
