// Question Engine (docs/QUESTION_ENGINE.md) — "Replace generic chat.
// Generate the NEXT BEST diagnostic question. Only ask one question at a
// time... Questions should maximize diagnostic value." A fixed, ordered
// question bank (priority tier = diagnostic value, lowest tier asked
// first) rather than an AI-improvised question — the same "deterministic,
// not AI-generated" principle already used for the Phase 1 landing intake
// engine (src/lib/landing-intake/engine.ts) and this app's pattern/
// priority engines (src/lib/scan-diagnostics/{patterns,priority}.ts).
//
// "Already asked" is tracked via diagnostic_questions.field_key for this
// case (not by re-deriving it from evidence presence), so a question is
// never asked twice even if its answer didn't produce the exact evidence
// type the checklist expects.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  DiagnosticQuestion,
  DiagnosticAnswer,
  QuestionResponseType,
  EvidenceItem,
  EvidenceType,
} from "@/lib/diagnostic-engine/types";

export interface CandidateQuestion {
  fieldKey: string;
  questionText: string;
  responseType: QuestionResponseType;
  choices?: string[];
  /** Lower = higher diagnostic value, asked sooner. */
  priorityTier: number;
  /** Skip this candidate if the case already has evidence of this type (redundant question). */
  skipIfEvidenceType?: EvidenceType;
}

// Ordered by the same foundational-first philosophy already documented in
// DEFAULT_SYSTEM_PROMPT (shared-prompt.ts): complaint/symptom triage before
// DTC-status nuance, basic mechanical/electrical checks (crank, start,
// battery) before anything requiring specialized tools, freeze-frame/live-
// data availability before assuming it doesn't exist. Extend this list as
// new question types prove useful — never invent a one-off question
// outside this bank at request time.
export const QUESTION_BANK: CandidateQuestion[] = [
  {
    fieldKey: "complaint",
    questionText: "What is the customer's main complaint?",
    responseType: "text",
    priorityTier: 1,
    skipIfEvidenceType: "complaint",
  },
  {
    fieldKey: "symptom_onset",
    questionText: "When does this happen — cold start, under load, at idle, or all the time?",
    responseType: "text",
    priorityTier: 2,
  },
  {
    fieldKey: "dtc_status",
    questionText: "Are the stored codes current, or history/intermittent?",
    responseType: "choice",
    choices: ["current", "history", "intermittent", "unknown"],
    priorityTier: 2,
  },
  {
    fieldKey: "crank_status",
    questionText: "Does the engine crank?",
    responseType: "yes_no",
    priorityTier: 3,
  },
  {
    fieldKey: "start_status",
    questionText: "Does the engine start?",
    responseType: "yes_no",
    priorityTier: 3,
  },
  {
    fieldKey: "battery_voltage",
    questionText: "What is the battery voltage at rest and while cranking?",
    responseType: "text",
    priorityTier: 4,
  },
  {
    fieldKey: "freeze_frame_available",
    questionText: "Do you have freeze-frame data for this code?",
    responseType: "yes_no",
    priorityTier: 4,
    skipIfEvidenceType: "freeze_frame",
  },
  {
    fieldKey: "live_data_available",
    questionText: "Is live data available from a scan tool right now?",
    responseType: "yes_no",
    priorityTier: 4,
    skipIfEvidenceType: "live_data",
  },
  {
    fieldKey: "previous_repair",
    questionText: "Has any related repair or part replacement been attempted already?",
    responseType: "text",
    priorityTier: 5,
    skipIfEvidenceType: "previous_repair",
  },
];

function priorityScoreForTier(tier: number): number {
  // Internal ordering value only — never surfaced to a user as a
  // probability. Higher = asked sooner.
  return Math.max(0, 100 - tier * 10);
}

export function selectNextQuestion(
  askedFieldKeys: ReadonlySet<string>,
  evidence: EvidenceItem[],
): CandidateQuestion | null {
  const presentTypes = new Set(evidence.map((e) => e.type));
  const candidates = QUESTION_BANK.filter(
    (q) => !askedFieldKeys.has(q.fieldKey) && !(q.skipIfEvidenceType && presentTypes.has(q.skipIfEvidenceType)),
  );
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => a.priorityTier - b.priorityTier)[0];
}

interface QuestionRow {
  id: string;
  case_id: string;
  sequence: number;
  field_key: string;
  question_text: string;
  response_type: QuestionResponseType;
  choices: string[];
  priority_score: number | null;
  asked_at: string;
  answered: boolean;
}

function fromRow(row: QuestionRow): DiagnosticQuestion {
  return {
    id: row.id,
    caseId: row.case_id,
    sequence: row.sequence,
    fieldKey: row.field_key,
    questionText: row.question_text,
    responseType: row.response_type,
    choices: row.choices,
    priorityScore: row.priority_score,
    askedAt: row.asked_at,
    answered: row.answered,
  };
}

export async function getQuestionsForCase(caseId: string): Promise<DiagnosticQuestion[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("diagnostic_questions")
    .select("*")
    .eq("case_id", caseId)
    .order("sequence", { ascending: true });
  if (error) throw error;
  return (data as QuestionRow[]).map(fromRow);
}

export async function recordQuestion(caseId: string, candidate: CandidateQuestion): Promise<DiagnosticQuestion> {
  const supabase = createAdminClient();
  const existing = await getQuestionsForCase(caseId);
  const sequence = existing.length + 1;

  const { data, error } = await supabase
    .from("diagnostic_questions")
    .insert({
      case_id: caseId,
      sequence,
      field_key: candidate.fieldKey,
      question_text: candidate.questionText,
      response_type: candidate.responseType,
      choices: candidate.choices ?? [],
      priority_score: priorityScoreForTier(candidate.priorityTier),
    })
    .select("*")
    .single();
  if (error) throw error;
  return fromRow(data as QuestionRow);
}

export async function recordAnswer(
  questionId: string,
  caseId: string,
  answerText: string,
  answerValue?: unknown,
): Promise<DiagnosticAnswer> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("diagnostic_answers")
    .insert({ question_id: questionId, case_id: caseId, answer_text: answerText, answer_value: answerValue ?? null })
    .select("*")
    .single();
  if (error) throw error;

  const { error: updateError } = await supabase
    .from("diagnostic_questions")
    .update({ answered: true })
    .eq("id", questionId);
  if (updateError) throw updateError;

  return {
    id: data.id,
    questionId: data.question_id,
    caseId: data.case_id,
    answerText: data.answer_text,
    answerValue: data.answer_value,
    answeredAt: data.answered_at,
  };
}
