# Question Engine

Replaces generic chat with "generate the NEXT BEST diagnostic question, one at a time,
maximizing diagnostic value" (`src/lib/diagnostic-engine/question.ts`).

## A fixed, ordered question bank — not an AI-improvised question

`QUESTION_BANK` is a deterministic, priority-tiered list (lower tier = higher diagnostic value,
asked sooner), mirroring the same foundational-first philosophy already documented in
`DEFAULT_SYSTEM_PROMPT`: complaint/symptom triage (tier 1–2) before DTC-status nuance (tier 2),
before basic mechanical/electrical checks like crank/start/battery-voltage (tier 3–4), before
freeze-frame/live-data availability and prior-repair history (tier 4–5). This is the same
"deterministic, not AI-generated" principle already used for the Phase 1 landing intake engine
and this app's pattern/priority engines — never a one-off question invented at request time.

```ts
interface CandidateQuestion {
  fieldKey: string;
  questionText: string;
  responseType: "text" | "yes_no" | "choice";
  choices?: string[];
  priorityTier: number;
  skipIfEvidenceType?: EvidenceType; // skip if this evidence already exists — avoids a redundant question
}
```

## Selection

`selectNextQuestion(askedFieldKeys, evidence)` filters out any candidate already asked (tracked
by `fieldKey`, not by re-deriving it from evidence presence — a question is never re-asked even
if its answer didn't produce the exact evidence type the checklist expects) and any candidate
whose `skipIfEvidenceType` evidence already exists, then returns the lowest-tier remaining
candidate, or `null` once every candidate has been asked or is redundant (a signal to move to
confidence evaluation instead of asking more questions).

## Persistence

`diagnostic_questions` (one row per question asked, in order, `priority_score` an **internal
ordering value only** — never shown to a user as a probability/statistic, same split as
`confidence.ts`'s categorical/internal-score separation) and `diagnostic_answers` (one row per
answer, unique on `question_id`). `recordQuestion`/`getQuestionsForCase`/`recordAnswer` are the
full persistence surface.

## The answer loop

1. `/turn` selects and persists the next question (if `QUESTION_ENGINE_ENABLED`).
2. The technician answers via `POST /api/diagnostic-engine/v1/cases/[caseId]/answers`, which
   calls `recordAnswer` (marks the question answered) and `evidenceFromAnswer` (adds the answer
   as a new, high-confidence `EvidenceItem` — see [EVIDENCE_ENGINE.md](EVIDENCE_ENGINE.md)).
3. The next `/turn` call sees the new evidence, so `selectNextQuestion` naturally advances past
   the now-redundant question and the Probability Engine reasons over the updated evidence set.

This is the concrete implementation of the spec's example: *"Does the engine crank?" → answer →
graph updates → next question "Do injector pulse exist?" → answer → probability recalculated.*
