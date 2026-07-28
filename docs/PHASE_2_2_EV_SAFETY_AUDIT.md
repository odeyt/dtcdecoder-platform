# Phase 2.2 — EV/High-Voltage Safety Audit

Read-only audit, per this phase's Step 1, of why high-voltage cases do not consistently classify
as `immediate_stop`. No code changed while writing this — findings below drive Step 2's fix.

## Root cause #1 (the primary one): HV hazards are never even detected at the evidence layer

`classifyDtcRelevance()` (`src/lib/scan-diagnostics/parsers/category-classification.ts`) is the
function that decides whether a DTC gets flagged as safety-relevant at all. Its pattern is:

```ts
const SAFETY_SYSTEM_PATTERN = /\b(srs|airbag|abs|anti-?lock brake|steering|brake|restraint)\b/i;
```

**This pattern contains zero high-voltage or EV-related keywords.** A real scan report's
`P0AA6 — Hybrid/EV Battery Isolation Fault`, or any DTC description mentioning "isolation,"
"insulation," "contactor," "interlock," "thermal," "orange cable," "pyro-fuse," or "high voltage,"
would **never** be flagged `safetyRelevance: true` by this function — it only matches
brake/steering/airbag/restraint terminology. Consequently, `buildEvidenceFromCase`
(`diagnostic-engine/evidence.ts`), which derives a `safety_issue` evidence item only for DTCs
where `dtc.safetyRelevance` is already `true`, never produces `safety_issue` evidence for a
genuine HV fault pulled from a real scan case. The only reason the Phase 2.1 validation harness's
`ev-high-voltage-safety` fixture had `safety_issue` evidence at all is that it was **hand-authored
directly into the fixture** — a real case ingested through the actual extraction pipeline would
have none.

This is the single most important finding: the gap isn't just "classification doesn't reach
`immediate_stop`" — it's that **the evidence needed to trigger any escalation at all is never
generated** for a real high-voltage fault.

## Root cause #2: the only path to `immediate_stop`/`tow_recommended` is AI-text keyword matching

`classifyDriveSafety()` (`diagnostic-engine/safety.ts`) only escalates past `drive_with_caution`
by scanning the AI's own free-text `safetyWarnings` for a fixed keyword list
(`IMMEDIATE_STOP_KEYWORDS`, `TOW_RECOMMENDED_KEYWORDS`). Evidence alone — even the (currently
never-produced) `safety_issue` type — only ever reaches `drive_with_caution`, one tier below the
top. This means:

- Whether a genuinely dangerous HV case gets flagged `immediate_stop` depends entirely on the AI
  choosing wording that happens to match the keyword list (`"do not drive"`, `"fire risk"`, etc.)
  — a technically-correct but differently-worded warning (e.g. "isolation fault detected, service
  required before further operation") would **not** match and would under-classify.
- There is no deterministic, evidence-only path to `immediate_stop` at all today, for any hazard
  category — HV or otherwise.

## Root cause #3: nothing prevents a later turn from silently regressing severity

`classifyDriveSafety` is a pure function re-evaluated from scratch on every turn, from that turn's
current evidence + that turn's AI `safetyWarnings` only. There is no persisted "safety floor" for
a case. If turn 1's AI output happened to use alarming language (reaching `immediate_stop`) but
turn 2's AI output — reasoning over the same or even worse evidence — phrases things more mildly,
turn 2's classification can come out *lower* than turn 1's, with nothing to prevent it. This is
exactly the "provider must not be able to downgrade a deterministic result" risk the phase brief
identifies, and today there is no precedence model at all — deterministic and AI-derived signals
are just... whichever rule matches first in a flat priority list, not compared against each other.

## Root cause #4: a failed or skipped turn returns no safety information at all

In `orchestrator.ts`, `safety` is only computed `if (aiOutput)` — i.e. only on a turn that
actually got a fresh AI response. On a skipped turn (cost optimization) or a failed turn
(provider error), `runDiagnosticEngineTurn` returns `safety: null`. A technician who saw an
alarming safety warning on turn 1 and then triggers a turn that gets skipped or fails would see
`safety: null` — which a UI could easily render as "no warning," reading as *less* alarming than
what was already established. This directly matches the audit's own question: *"any case where
driving could remain permitted despite HV... faults"* — yes, on any turn after the first that
doesn't produce a fresh AI response.

## Checklist answers

- **Missing evidence mappings**: yes — no `EvidenceType` exists for any HV-specific hazard
  category (isolation, thermal, contactor, interlock, cable damage, water intrusion, etc.); all
  HV facts would currently have to be shoehorned into the generic `safety_issue` or `dtc_stored`
  types, losing the category information needed for structured output (Step 4) or a dedicated
  rule (Step 2).
- **Missing keywords or evidence types**: yes — `SAFETY_SYSTEM_PATTERN` (root cause #1) and
  `IMMEDIATE_STOP_KEYWORDS`/`TOW_RECOMMENDED_KEYWORDS` (root cause #2) have no HV vocabulary.
- **Weak rule ordering**: yes — rules are a flat "first match wins" list with no severity
  comparison between the evidence-derived and AI-text-derived signals (root cause #3).
- **Conflicts between symptom and safety rules**: not directly observed — symptom-derived
  evidence (`symptom`, `complaint`) never feeds `classifyDriveSafety` at all today, so there's no
  conflict, just an absence of signal.
- **Whether LLM output can weaken deterministic safety**: yes, structurally — see root cause #3.
  There is currently no "deterministic" tier to weaken in the HV case specifically (since none
  exists yet), but the *general* architecture has no floor-preservation mechanism for any hazard
  category.
- **Whether incomplete evidence incorrectly defaults to a lower classification**: yes — the
  default (no evidence, no warnings) is `safe_to_drive`, and because HV evidence is never
  generated (root cause #1), an HV case with incomplete evidence collection defaults there too,
  identical to a case with no safety concern at all.
- **Cases where driving remains permitted despite an HV fault**: confirmed — any of the 17 hazard
  categories listed in the phase brief, ingested from a real scan case today, produces no
  `safety_issue` evidence (root cause #1) and therefore relies entirely on the AI's own wording
  (root cause #2) to reach anything above `safe_to_drive`. A skipped/failed turn compounds this by
  returning no safety information at all (root cause #4).

## Other audit targets reviewed

- **Prompt Builder safety section** (`prompt-builder.ts`): renders `safety_issue`-typed evidence
  only — never sees whatever new HV evidence type Step 2 introduces unless the section is
  extended to include it (it will be, as part of Step 2/4, by construction — the section already
  iterates evidence by type generically for other sections, so adding the new type to its
  evidence listing is a small, low-risk addition, not a rebuild).
- **Response Formatter safety output** (`response-formatter.ts`): passes through `output.safetyWarnings`
  (raw AI text) as `DiagnosticEngineResponse.safety: string[]` — no structured hazard
  category/immediate-action/PPE fields exist anywhere today (this is the literal Step 4
  requirement, confirmed as net-new work, not a fix to something broken).
- **Diagnostic Graph safety nodes**: `GraphNodeKind` is `"evidence" | "hypothesis" | "test" |
  "question"` — there is no `"safety"` node kind. Not treated as a defect for this pass (the
  graph's job is case reasoning state, and safety classification is already visible via
  `turnResult.safety` independent of the graph) — noted for completeness per the audit checklist,
  no change planned.
- **API fallback behavior**: `toSafeErrorResponse` never fabricates a safety status on error — a
  failed turn surfaces as an HTTP error, not a fake "safe" response. The gap is narrower and more
  specific: a *successful but skipped* turn (cost optimization) returns `safety: null` rather than
  the case's last-known classification (root cause #4).
- **Existing deterministic safety rules** (`scan-diagnostics/safety-rules.ts`, the Phase 0
  comm-code replacement guard): unrelated subsystem (governs whether the AI may recommend
  replacing a module without a confirming test first) — no HV logic there either, and no overlap
  with `diagnostic-engine/safety.ts` to reconcile.

## What Step 2 will fix

1. A new deterministic evidence type (`hv_safety_hazard`) derived directly in
   `diagnostic-engine/evidence.ts` from DTC description text against a dedicated HV keyword list —
   confined entirely to the Diagnostic Engine (Phase 2 scope), not touching the Phase 0
   `scan_dtc_records`/`classifyDtcRelevance` extraction pipeline at all, to avoid widening this
   fix into a rebuild of shared, already-shipped infrastructure.
2. A genuinely deterministic `immediate_stop` rule in `classifyDriveSafety` triggered by that
   evidence alone (current-status DTCs only — historical/inactive codes never trigger it).
3. A severity-precedence combinator: evidence-derived floor and AI-text-derived signal are both
   computed, and the classification returned is whichever is **more severe** — AI text can never
   pull the result below what evidence alone already established.
4. Structured HV output fields (hazard category, immediate action, prohibited actions, required
   qualification, isolation/towing recommendation, PPE warning, manufacturer-procedure warning) on
   `DriveSafetyClassification`, populated only for HV-hazard-driven `immediate_stop` cases.
