import type { GraphValidationIssue } from "./issues";
import { COMPILER_VERSION } from "./limits";
import { semanticGraphHash } from "./hash";
import { parseGraph, type WorkflowGraphV2, type WorkflowNode } from "./schema-v2";
import { dominatorsOf, validateGraph } from "./validate";

export type CompiledPlan = {
  compilerVersion: number;
  contentHash: string;
  entryNodeId: string;
  topoOrder: string[];
  ports: Record<string, Record<string, string>>;
  nodesById: Record<string, WorkflowNode>;
  dominators: Record<string, string[]>;
};

export function compileGraph(
  input: unknown,
): { ok: true; plan: CompiledPlan } | { ok: false; issues: GraphValidationIssue[] } {
  const issues = validateGraph(input);
  if (issues.length > 0) return { ok: false, issues };
  const graph = parseGraph(input);
  return { ok: true, plan: compileValidGraph(graph) };
}

export function compileValidGraph(graph: WorkflowGraphV2): CompiledPlan {
  const nodesById: Record<string, WorkflowNode> = Object.create(null);
  for (const node of graph.nodes) nodesById[node.id] = node;

  const incoming = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const node of graph.nodes) {
    incoming.set(node.id, 0);
    adj.set(node.id, []);
  }
  const ports: Record<string, Record<string, string>> = Object.create(null);
  for (const edge of graph.edges) {
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    adj.get(edge.source)?.push(edge.target);
    ports[edge.source] ??= Object.create(null);
    ports[edge.source]![edge.port] = edge.target;
  }

  const queue = graph.nodes.filter((node) => (incoming.get(node.id) ?? 0) === 0).map((node) => node.id);
  const topoOrder: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    topoOrder.push(id);
    for (const next of adj.get(id) ?? []) {
      const rest = (incoming.get(next) ?? 1) - 1;
      incoming.set(next, rest);
      if (rest === 0) queue.push(next);
    }
  }

  const dominators: Record<string, string[]> = Object.create(null);
  for (const [id, set] of dominatorsOf(graph)) {
    dominators[id] = [...set].sort();
  }

  return {
    compilerVersion: COMPILER_VERSION,
    contentHash: semanticGraphHash(graph),
    entryNodeId: graph.entryNodeId,
    topoOrder,
    ports,
    nodesById,
    dominators,
  };
}
