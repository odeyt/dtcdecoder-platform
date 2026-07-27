# Evidence Engine

The first stage of the Phase 2 pipeline (`src/lib/diagnostic-engine/evidence.ts`). Every fact the
engine reasons over becomes a structured, persisted `EvidenceItem` — never a raw string folded
into a prompt.

## Shape

```ts
interface EvidenceItem {
  id: string;
  caseId: string;
  type: EvidenceType;   // 18-value union, matches migration 0031's check constraint
  value: unknown;       // shape depends on type — a string, a number, or a small object
  source: EvidenceSource;
  confidence: EvidenceConfidence; // "high" | "medium" | "low" | "unknown" — categorical only
  recordedAt: string;
}
```

`EvidenceType` covers: `vin`, `vehicle`, `engine`, `transmission`, `mileage`, `complaint`,
`symptom`, `dtc_stored`, `dtc_pending`, `dtc_permanent`, `freeze_frame`, `live_data`,
`previous_repair`, `known_repair`, `technician_note`, `safety_issue`, `environmental_condition`,
`question_answer`, `other`. `EvidenceSource` covers: `extraction`, `user_reported`,
`technician_entered`, `question_answer`, `scan_report`, `derived`.

`confidence` is categorical, matching this app's established
[DIAGNOSTIC_SAFETY_RULES.md](DIAGNOSTIC_SAFETY_RULES.md) policy — there is no numeric score
anywhere in the evidence model that could be misread as a calibrated probability.

## Deriving evidence from an existing case

`buildEvidenceFromCase(scanCase, extraction, canonicalScan)` deterministically derives evidence
from a case's own persisted state — VIN/vehicle/engine/mileage from `CanonicalVehicleScan`,
complaint/symptoms/recent-repairs/technician-notes from `scan_cases`, one item per DTC in
`canonicalScan.allDtcs` (typed `dtc_pending`/`dtc_permanent`/`dtc_stored` by status), an
additional `safety_issue` item for any DTC flagged `safetyRelevance`, and `freeze_frame`/
`live_data` items when present on the extraction. Works identically regardless of whether the
case started from a scan upload, quick DTC entry, or a landing intake — all three populate the
same underlying rows.

The orchestrator calls this exactly once per case, on the first turn (`ensureInitialEvidence` in
`orchestrator.ts`) — later turns skip it entirely, since evidence only grows afterward via
Question Engine answers.

## Answers become evidence

`evidenceFromAnswer(fieldKey, answerText, answerValue)` wraps a Question Engine answer as a
`question_answer`-typed, high-confidence `EvidenceItem` (`fieldKey` ties it back to the question
that produced it). The `/answers` API route calls this immediately after persisting the answer
itself, so the evidence and the question/answer log never disagree about what's now known.

## Deduplication (cost optimization)

`dedupeAgainstExisting(existing, candidates)` filters out any candidate whose `(type,
JSON.stringify(value))` pair already exists for the case — never re-inserts a fact already known.
This is the "reuse evidence" half of
[cost optimization](PHASE_2_ARCHITECTURE.md#deliberately-deferred--open-decisions); the other
half (skipping a redundant AI call) is in `cost-optimization.ts`, covered in
[PROBABILITY_ENGINE.md](PROBABILITY_ENGINE.md).

## Persistence

`insertEvidence`/`getEvidenceForCase` — plain append-only insert + ordered read, `diagnostic_evidence`
table (migration 0031), owner-read RLS. Evidence is never updated or deleted in place — a
correction arrives as a new, higher-confidence item (e.g. a `question_answer` superseding an
earlier inferred `symptom`), never an edit to the original row, preserving a full audit trail of
what was known when.
