# Diagnostic Graph

The evolving structure that is the source of truth for a case's reasoning state
(`src/lib/diagnostic-engine/graph.ts`), per the phase brief: "instead of storing conversation
history only, build an evolving diagnostic graph. Each answer updates the graph."

## Shape

```ts
type GraphNodeKind = "evidence" | "hypothesis" | "test" | "question";

interface GraphNode { id: string; kind: GraphNodeKind; label: string; status?: string; data?: Record<string, unknown>; }
interface GraphEdge { from: string; to: string; relation: string; }
interface DiagnosticGraph { caseId: string; nodes: GraphNode[]; edges: GraphEdge[]; version: number; updatedAt: string; }
```

Node ids are namespaced by kind — `evidence:{evidenceId}`, `hypothesis:{rank}`, `test:{rank}`,
`question:{questionId}` — so builders from different modules never collide.

## One current-state row per case, not a history log

`diagnostic_graph` (migration 0031) is `unique on case_id` and upserted in place, matching the
existing `scan_extractions` upsert-on-`case_id` convention. `version` increments on every save so
a stale read is detectable. This is deliberate: it's a single-case, single-writer structure with
no cross-case graph queries needed, so a fully relational node/edge schema (vs. JSONB columns)
would add migration/query complexity with no real benefit here.

## Builders

Each Phase 2 module that produces graph-relevant state has a matching pure builder function,
called fresh every turn from the CURRENT evidence/hypotheses/question — never hand-mutated:

- `buildEvidenceNodes(evidence)` — one node per `EvidenceItem`, status = its confidence.
- `buildHypothesisNodesAndEdges(hypotheses)` — one node per ranked hypothesis, plus a `supports`
  edge from each of its `supportingEvidenceIds`.
- `buildTestNodesAndEdges(tests)` — one node per planned test, plus a `tests` edge to each
  related hypothesis rank.
- `buildQuestionNode(question)` — one node per **persisted** `DiagnosticQuestion`, status
  `pending`/`answered`.

## Merge semantics

`mergeGraph(existing, additions)` merges by node id and by `(from, to, relation)` edge key — a
node/edge already present is **replaced**, never duplicated (so a question flipping from pending
to answered updates its existing node rather than adding a second one). This makes rebuilding the
graph from scratch every turn safe and idempotent: calling it twice with the same inputs produces
the same graph.

## How the orchestrator uses it

Only when `DIAGNOSTIC_GRAPH_ENABLED`: `runDiagnosticEngineTurn` reads the existing graph, builds
fresh evidence/hypothesis/question nodes from the turn's current state, merges them in, and saves
the result. The graph is also read (read-only, not rebuilt) to supply the Prompt Builder's
"DIAGNOSTIC GRAPH" section, and to power
[cost optimization](PROBABILITY_ENGINE.md#cost-optimization) — its evidence nodes are the only
persisted record of "which evidence did the last AI call already see."
