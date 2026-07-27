// Diagnostic Graph (docs/DIAGNOSTIC_GRAPH.md) — the evolving structure that
// is the source of truth for a case's reasoning state, per the phase
// brief: "Instead of storing conversation history only, build an evolving
// diagnostic graph. Each answer updates the graph." One current-state row
// per case (diagnostic_graph, migration 0031), upserted in place — never a
// growing history log, matching the existing scan_extractions/scan_reports
// upsert-on-case_id convention.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EvidenceItem } from "@/lib/diagnostic-engine/types";
import type {
  DiagnosticGraph,
  GraphNode,
  GraphEdge,
  RankedHypothesis,
  DiagnosticQuestion,
  PlannedTest,
} from "@/lib/diagnostic-engine/types";

interface GraphRow {
  case_id: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  version: number;
  updated_at: string;
}

function fromRow(row: GraphRow): DiagnosticGraph {
  return { caseId: row.case_id, nodes: row.nodes, edges: row.edges, version: row.version, updatedAt: row.updated_at };
}

export async function getGraphForCase(caseId: string): Promise<DiagnosticGraph | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("diagnostic_graph").select("*").eq("case_id", caseId).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as GraphRow) : null;
}

export async function saveGraph(caseId: string, nodes: GraphNode[], edges: GraphEdge[]): Promise<DiagnosticGraph> {
  const supabase = createAdminClient();
  const existing = await getGraphForCase(caseId);
  const nextVersion = (existing?.version ?? 0) + 1;

  const { data, error } = await supabase
    .from("diagnostic_graph")
    .upsert(
      { case_id: caseId, nodes, edges, version: nextVersion, updated_at: new Date().toISOString() },
      { onConflict: "case_id" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return fromRow(data as GraphRow);
}

function evidenceNodeId(evidenceId: string): string {
  return `evidence:${evidenceId}`;
}

function evidenceLabel(item: EvidenceItem): string {
  if (typeof item.value === "string") return `${item.type}: ${item.value}`;
  if (item.value && typeof item.value === "object" && "code" in (item.value as Record<string, unknown>)) {
    return `${item.type}: ${(item.value as { code: string }).code}`;
  }
  return item.type;
}

// Builds (or rebuilds) evidence nodes from the current evidence list —
// idempotent: calling this again with the same evidence produces the same
// node set, so it's safe to call on every engine turn without duplicating
// nodes for facts already represented.
export function buildEvidenceNodes(evidence: EvidenceItem[]): GraphNode[] {
  return evidence.map((item) => ({
    id: evidenceNodeId(item.id),
    kind: "evidence",
    label: evidenceLabel(item),
    status: item.confidence,
    data: { evidenceId: item.id, evidenceType: item.type },
  }));
}

function hypothesisNodeId(rank: number): string {
  return `hypothesis:${rank}`;
}

export function buildHypothesisNodesAndEdges(hypotheses: RankedHypothesis[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  for (const h of hypotheses) {
    const nodeId = hypothesisNodeId(h.rank);
    nodes.push({
      id: nodeId,
      kind: "hypothesis",
      label: h.hypothesis,
      status: h.confidenceLevel,
      data: { rank: h.rank, evidenceStrength: h.evidenceStrength },
    });
    for (const evidenceId of h.supportingEvidenceIds) {
      edges.push({ from: evidenceNodeId(evidenceId), to: nodeId, relation: "supports" });
    }
  }
  return { nodes, edges };
}

function testNodeId(rank: number): string {
  return `test:${rank}`;
}

export function buildTestNodesAndEdges(tests: PlannedTest[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  for (const test of tests) {
    const nodeId = testNodeId(test.rank);
    nodes.push({ id: nodeId, kind: "test", label: test.step, data: { purpose: test.purpose, risk: test.risk } });
    for (const rank of test.relatedHypothesisRanks) {
      edges.push({ from: nodeId, to: hypothesisNodeId(rank), relation: "tests" });
    }
  }
  return { nodes, edges };
}

function questionNodeId(questionId: string): string {
  return `question:${questionId}`;
}

export function buildQuestionNode(question: DiagnosticQuestion): GraphNode {
  return {
    id: questionNodeId(question.id),
    kind: "question",
    label: question.questionText,
    status: question.answered ? "answered" : "pending",
    data: { fieldKey: question.fieldKey, sequence: question.sequence },
  };
}

// Merges new nodes/edges into an existing graph by node id — a node with
// an id already present is REPLACED (reflects its latest state, e.g. a
// question flipping from pending to answered), never duplicated.
export function mergeGraph(
  existing: { nodes: GraphNode[]; edges: GraphEdge[] },
  additions: { nodes: GraphNode[]; edges: GraphEdge[] },
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodeMap = new Map(existing.nodes.map((n) => [n.id, n]));
  for (const node of additions.nodes) nodeMap.set(node.id, node);

  const edgeKey = (e: GraphEdge) => `${e.from}->${e.to}:${e.relation}`;
  const edgeMap = new Map(existing.edges.map((e) => [edgeKey(e), e]));
  for (const edge of additions.edges) edgeMap.set(edgeKey(edge), edge);

  return { nodes: [...nodeMap.values()], edges: [...edgeMap.values()] };
}
