// Shared types for the Phase 2 Diagnostic Engine
// (docs/PHASE_2_ARCHITECTURE.md). Mirrors migration 0031's schema exactly —
// these are the TypeScript view over diagnostic_evidence/diagnostic_graph/
// diagnostic_questions/diagnostic_answers/diagnostic_probabilities/
// repair_verifications.
//
// Reuses ConfidenceLevel from the existing scan-diagnostics schema (the
// same high/medium/low/insufficient_evidence categorical band already
// established) rather than defining a second, parallel enum.
import type { ConfidenceLevel } from "@/lib/scan-diagnostics/schemas";

export type EvidenceType =
  | "vin"
  | "vehicle"
  | "engine"
  | "transmission"
  | "mileage"
  | "complaint"
  | "symptom"
  | "dtc_stored"
  | "dtc_pending"
  | "dtc_permanent"
  | "freeze_frame"
  | "live_data"
  | "previous_repair"
  | "known_repair"
  | "technician_note"
  | "safety_issue"
  | "environmental_condition"
  | "question_answer"
  | "other";

export type EvidenceSource =
  | "extraction"
  | "user_reported"
  | "technician_entered"
  | "question_answer"
  | "scan_report"
  | "derived";

// Categorical only — never a numeric score. See docs/EVIDENCE_ENGINE.md.
export type EvidenceConfidence = "high" | "medium" | "low" | "unknown";

export interface EvidenceItem {
  id: string;
  caseId: string;
  type: EvidenceType;
  value: unknown;
  source: EvidenceSource;
  confidence: EvidenceConfidence;
  recordedAt: string;
}

// Input shape for recording a new piece of evidence — no `id`/timestamps
// (server-assigned).
export type NewEvidenceItem = Omit<EvidenceItem, "id" | "caseId" | "recordedAt"> & { recordedAt?: string };

export type GraphNodeKind = "evidence" | "hypothesis" | "test" | "question";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  status?: string;
  data?: Record<string, unknown>;
}

export interface GraphEdge {
  from: string;
  to: string;
  relation: string;
}

export interface DiagnosticGraph {
  caseId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  version: number;
  updatedAt: string;
}

export type QuestionResponseType = "text" | "yes_no" | "choice";

export interface DiagnosticQuestion {
  id: string;
  caseId: string;
  sequence: number;
  fieldKey: string;
  questionText: string;
  responseType: QuestionResponseType;
  choices: string[];
  /** Internal ordering value only — never shown to a user as a probability/statistic. */
  priorityScore: number | null;
  askedAt: string;
  answered: boolean;
}

export interface DiagnosticAnswer {
  id: string;
  questionId: string;
  caseId: string;
  answerText: string;
  answerValue: unknown;
  answeredAt: string;
}

export type EvidenceStrength = "strong" | "moderate" | "weak";

export interface RankedHypothesis {
  rank: number;
  hypothesis: string;
  confidenceLevel: ConfidenceLevel;
  reasoning: string;
  evidenceStrength: EvidenceStrength;
  supportingEvidenceIds: string[];
  missingEvidence: string[];
  requiredTests: string[];
}

export interface RepairVerificationItem {
  item: string;
  completed: boolean;
  notes?: string;
}

export interface RepairVerification {
  caseId: string;
  checklist: RepairVerificationItem[];
  generatedAt: string;
  completedAt: string | null;
}

export type DriveSafetyStatus = "safe_to_drive" | "drive_with_caution" | "tow_recommended" | "immediate_stop";

export interface DriveSafetyClassification {
  status: DriveSafetyStatus;
  reasoning: string;
}

export type TestRisk = "low" | "moderate" | "high";
export type TestDifficulty = "easy" | "moderate" | "hard" | "professional";
// Categorical shop-time cost band, not a dollar estimate — same
// never-fabricate-a-number policy as EvidenceConfidence/ConfidenceLevel.
export type TestCost = "low" | "moderate" | "high";

export interface PlannedTest {
  rank: number;
  step: string;
  purpose: string;
  expectedResult: string;
  difficulty: TestDifficulty;
  risk: TestRisk;
  costLevel: TestCost;
  /** Which rank(s) in the probability table this test helps confirm/rule out. */
  relatedHypothesisRanks: number[];
}
