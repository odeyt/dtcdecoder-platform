# Probability Engine

"Never produce only one answer; generate ranked hypotheses... each probability must contain
reasoning" (`src/lib/diagnostic-engine/probability.ts`, persistence + `confidence.ts`).

## Deliberate deviation from the literal spec: no numeric percentages

The phase brief's own examples show raw numerical percentages ("87% Open Ground G103"). This app
has an established, deliberate, documented policy against exactly that —
[DIAGNOSTIC_SAFETY_RULES.md](DIAGNOSTIC_SAFETY_RULES.md) and every provider's safety suffix
explicitly forbid presenting a fabricated numerical confidence as a calibrated real-world
probability. This module instead ranks hypotheses in order with a categorical `confidenceLevel`
(`high`/`medium`/`low`/`insufficient_evidence` — the same enum already used throughout
`scan-diagnostics`) plus explicit reasoning per rank, which satisfies "never produce only one
answer, generate ranked hypotheses" without implying false precision.

## Building the ranked table

`buildRankedHypotheses(output, evidence)` maps the AI's own `rankedCauses` (the provider already
ranks causes; this doesn't re-derive AI reasoning) into the engine's `RankedHypothesis` shape,
then **re-sorts** by categorical confidence level (high → medium → low → insufficient_evidence,
ties broken by the AI's original order) and re-numbers ranks 1..N — so the persisted order always
reflects confidence, even if the AI's own ordering didn't.

```ts
interface RankedHypothesis {
  rank: number;
  hypothesis: string;
  confidenceLevel: ConfidenceLevel;
  reasoning: string;
  evidenceStrength: "strong" | "moderate" | "weak";
  supportingEvidenceIds: string[];
  missingEvidence: string[];   // always [] here — see below
  requiredTests: string[];
}
```

**Evidence attribution** (`matchEvidenceIds`) is a conservative, exact-substring match: an
`EvidenceItem` is linked to a hypothesis only when its own value (a DTC code, a VIN, a string)
appears verbatim in the AI's `supportingEvidence` text — never a fuzzy/semantic match, so it never
falsely claims a piece of evidence "supports" a cause it doesn't actually mention.

**Evidence strength** (`deriveEvidenceStrength`): contradicting ≥ supporting → `weak`; 2+
supporting → `strong`; exactly 1 → `moderate`; otherwise `weak`.

**`missingEvidence` is always `[]`** on a per-hypothesis basis — there is no reliable
deterministic way to attribute "which specific evidence gap applies to THIS hypothesis" without
NLP this app doesn't have, so it's intentionally left empty rather than guessed. Missing evidence
is a **case-level** concept instead, computed by the Confidence Engine below.

## Confidence Engine

`confidence.ts`'s `computeEvidenceStrength(evidence)` is a fully deterministic checklist — plain
set-membership over which `EvidenceType` categories (DTC, Freeze Frame, Live Data, Symptoms,
Repair History, Vehicle Identification) this case actually has. No AI judgment, no fuzzy scoring.
`computeEngineConfidence(hypotheses, evidence)` combines this with the top-ranked hypothesis's own
`confidenceLevel` (never re-derived independently — the overall confidence IS the leading
hypothesis's confidence) and a de-duplicated union of every hypothesis's `requiredTests`.

## Persistence

`diagnostic_probabilities` — **delete-then-insert** per recompute (`saveHypotheses`), matching the
existing `scan_patterns` convention: this table holds the current ranked-hypothesis snapshot for
a case, never an accumulating history of every past ranking.

## Cost optimization

`src/lib/diagnostic-engine/cost-optimization.ts` implements the spec's "minimize every OpenAI
call" requirement concretely: `shouldSkipRedundantAiCall` compares the case's current evidence set
against the evidence already represented as nodes in the persisted [Diagnostic
Graph](DIAGNOSTIC_GRAPH.md) — if they're an exact match AND hypotheses already exist, the
orchestrator skips the AI call entirely and reuses the existing snapshot (`costOptimization.aiCallSkipped`
in the turn result), rather than re-running an identical generation for no new information. Only
active when `DIAGNOSTIC_GRAPH_ENABLED`, since the graph is the only persisted record of what a
past call already saw. Separately, `AnthropicDiagnosticProvider.runDiagnosticEngineTurn` marks its
(byte-identical, per-case-independent) system prompt with Anthropic prompt-cache `cache_control`,
so repeated turns reuse the cached prefix instead of paying full input-token price for it every
time — the concrete "support future response caching" implementation.
