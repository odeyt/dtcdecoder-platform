// Cost Optimization (docs/PHASE_2_ARCHITECTURE.md#cost-optimization) —
// "minimize every OpenAI call; reuse evidence; reuse graph; only send
// changed evidence." Two of those four are already satisfied elsewhere:
// evidence.ts's dedupeAgainstExisting never re-persists a fact already
// known, and graph.ts's mergeGraph/versioned upsert never rebuilds the
// graph from scratch. This module covers the remaining one that's
// actionable without a new migration: skip a redundant AI call entirely
// when nothing has changed since the graph last reflected the case's
// evidence — a case with no new evidence has nothing new for the AI to
// reason about, so re-running it would just reproduce the same ranked
// hypotheses at full cost.
//
// This is deliberately graph-dependent (only takes effect when
// DIAGNOSTIC_GRAPH_ENABLED, since the graph's own evidence nodes are what
// let us tell "unchanged since last AI call" from "genuinely new"). With
// the graph off there is no persisted memory of what evidence a past call
// already saw, so every call is treated as potentially new — never skip
// blindly just because hypotheses already exist.
import type { EvidenceItem, DiagnosticGraph } from "@/lib/diagnostic-engine/types";

export function evidenceIdsRepresentedInGraph(graph: DiagnosticGraph | null): Set<string> {
  if (!graph) return new Set();
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (node.kind === "evidence" && typeof node.data?.evidenceId === "string") {
      ids.add(node.data.evidenceId);
    }
  }
  return ids;
}

// True only when the case's CURRENT evidence set is exactly the set the
// graph already represents — an exact match (same count, same ids), not a
// subset check, so evidence removed/replaced still counts as a change.
export function evidenceUnchangedSinceGraph(evidence: EvidenceItem[], graph: DiagnosticGraph | null): boolean {
  if (!graph) return false;
  const graphIds = evidenceIdsRepresentedInGraph(graph);
  if (graphIds.size !== evidence.length) return false;
  return evidence.every((item) => graphIds.has(item.id));
}

// The actual "should we skip this turn's AI call" decision: evidence must
// be unchanged AND a real prior assessment must already exist to reuse —
// a case with no hypotheses yet always needs its first real AI call
// regardless of how the graph looks.
export function shouldSkipRedundantAiCall(params: {
  evidence: EvidenceItem[];
  graph: DiagnosticGraph | null;
  hasExistingHypotheses: boolean;
}): boolean {
  return params.hasExistingHypotheses && evidenceUnchangedSinceGraph(params.evidence, params.graph);
}
