import type { AutomationPatchV1 } from "./plan-compiler";
import { canonicalJson, semanticGraphHash, sha256Hex } from "./hash";
import type { WorkflowGraphV2, WorkflowNode, WorkflowEdge } from "./schema-v2";

export type AutomationSubgraph = {
  schemaVersion: 2;
  entryNodeId: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  nodeIds: string[];
  subgraphHash: string;
  graphHash: string;
  cursor: string | null;
  nextCursor: string | null;
};

function cursorOffset(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const value = Number.parseInt(
      Buffer.from(cursor, "base64url").toString("utf8"),
      10,
    );
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

export function computeAutomationSubgraphHash(input: {
  schemaVersion: number;
  entryNodeId: string;
  nodes: readonly WorkflowNode[];
  edges: readonly WorkflowEdge[];
}): string {
  return sha256Hex(
    canonicalJson({
      schemaVersion: input.schemaVersion,
      entryNodeId: input.entryNodeId,
      nodes: [...input.nodes].sort((a, b) => a.id.localeCompare(b.id)),
      edges: [...input.edges].sort((a, b) => a.id.localeCompare(b.id)),
    }),
  );
}

/**
 * Selects a deterministic, connected-by-edge subgraph. Pagination is over
 * node ids, while edges are included only when both endpoints are in the
 * selected page. This makes every page independently hashable and rebasing
 * safe for large graphs.
 *
 * `depth` expands `nodeIds` by graph neighborhood (BFS over edges in both
 * directions) before pagination, so the model can ask for "this node plus
 * 2 hops" instead of enumerating every id.
 */
export function selectAutomationSubgraph(input: {
  graph: WorkflowGraphV2;
  nodeIds?: string[];
  depth?: number;
  cursor?: string;
  limit?: number;
}): AutomationSubgraph {
  const depth = Math.min(Math.max(Math.floor(input.depth ?? 0), 0), 5);
  let requested = input.nodeIds?.length
    ? new Set(input.nodeIds)
    : undefined;
  if (requested && depth > 0) {
    requested = expandByDepth(input.graph, requested, depth);
  }
  const candidates = input.graph.nodes
    .filter((node) => !requested || requested.has(node.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  const offset = cursorOffset(input.cursor);
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const page = candidates.slice(offset, offset + limit);
  const selected = new Set(page.map((node) => node.id));
  const edges = input.graph.edges.filter(
    (edge) => selected.has(edge.source) && selected.has(edge.target),
  );
  const subgraphHash = computeAutomationSubgraphHash({
    schemaVersion: input.graph.schemaVersion,
    entryNodeId: input.graph.entryNodeId,
    nodes: page,
    edges,
  });
  const nextOffset = offset + page.length;
  return {
    schemaVersion: input.graph.schemaVersion,
    entryNodeId: input.graph.entryNodeId,
    nodes: page,
    edges,
    nodeIds: page.map((node) => node.id),
    subgraphHash,
    graphHash: semanticGraphHash(input.graph),
    cursor: input.cursor ?? null,
    nextCursor: nextOffset < candidates.length ? encodeCursor(nextOffset) : null,
  };
}

function expandByDepth(
  graph: WorkflowGraphV2,
  seeds: Set<string>,
  depth: number,
): Set<string> {
  const adjacency = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    adjacency.get(a)!.add(b);
  };
  for (const edge of graph.edges) {
    link(edge.source, edge.target);
    link(edge.target, edge.source);
  }
  const seen = new Set(seeds);
  let frontier = [...seeds];
  for (let hop = 0; hop < depth && frontier.length > 0; hop += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbor of adjacency.get(id) ?? []) {
        if (!seen.has(neighbor)) {
          seen.add(neighbor);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }
  return seen;
}

function targetNodeIds(patch: AutomationPatchV1): string[] {
  const ids = new Set(patch.baseNodeIds ?? []);
  for (const operation of patch.operations) {
    if ("nodeId" in operation) ids.add(operation.nodeId);
    if (operation.op === "addNode") ids.add(operation.node.id);
    if (operation.op === "connect") {
      ids.add(operation.source);
      ids.add(operation.target);
    }
    if (operation.op === "replaceSubgraph") {
      operation.removeNodeIds.forEach((id) => ids.add(id));
      operation.addNodes.forEach((node) => ids.add(node.id));
      operation.addEdges.forEach((edge) => {
        ids.add(edge.source);
        ids.add(edge.target);
      });
    }
    if (operation.op === "autoLayoutSubset") {
      operation.nodeIds.forEach((id) => ids.add(id));
    }
  }
  return [...ids].sort();
}

export type AutomationPatchRebaseResult =
  | {
      ok: true;
      patch: AutomationPatchV1;
      rebasedFrom: { revision: number; contentHash: string; subgraphHash?: string };
      targetNodeIds: string[];
    }
  | {
      ok: false;
      reason: "missing_base" | "subgraph_conflict" | "graph_conflict";
      conflicts: string[];
      currentSubgraphHash: string;
      targetNodeIds: string[];
    };

/**
 * Rebase only when the declared subgraph is unchanged. It intentionally does
 * not perform a three-way merge: a changed target is returned as a conflict
 * so Harly can fetch a fresh subgraph and ask the user/model to resolve it.
 */
export function rebaseAutomationPatch(input: {
  patch: AutomationPatchV1;
  currentGraph: WorkflowGraphV2;
  currentRevision: number;
  currentContentHash: string;
}): AutomationPatchRebaseResult {
  // baseGraphHash is a legacy alias; baseContentHash wins when both agree
  // (the schema already rejects disagreement).
  const { patch: rawPatch } = input;
  const patch: AutomationPatchV1 = {
    ...rawPatch,
    baseContentHash: rawPatch.baseContentHash ?? rawPatch.baseGraphHash,
  };
  const targetNodeIds = targetNodeIdsForRebase(patch);
  if (patch.baseRevision === undefined || !patch.baseContentHash) {
    return {
      ok: false,
      reason: "missing_base",
      conflicts: targetNodeIds,
      currentSubgraphHash: selectAutomationSubgraph({
        graph: input.currentGraph,
        nodeIds: targetNodeIds,
      }).subgraphHash,
      targetNodeIds,
    };
  }

  const currentSubgraph = selectAutomationSubgraph({
    graph: input.currentGraph,
    nodeIds: targetNodeIds,
  });
  const graphUnchanged =
    patch.baseRevision === input.currentRevision &&
    patch.baseContentHash === input.currentContentHash;
  const subgraphUnchanged =
    Boolean(patch.baseSubgraphHash) &&
    patch.baseSubgraphHash === currentSubgraph.subgraphHash;
  if (!graphUnchanged && !subgraphUnchanged) {
    return {
      ok: false,
      reason: patch.baseSubgraphHash ? "subgraph_conflict" : "graph_conflict",
      conflicts: targetNodeIds,
      currentSubgraphHash: currentSubgraph.subgraphHash,
      targetNodeIds,
    };
  }
  return {
    ok: true,
    patch: {
      ...patch,
      baseRevision: input.currentRevision,
      baseContentHash: input.currentContentHash,
      baseSubgraphHash: currentSubgraph.subgraphHash,
      baseNodeIds: targetNodeIds,
    },
    rebasedFrom: {
      revision: patch.baseRevision,
      contentHash: patch.baseContentHash,
      ...(patch.baseSubgraphHash
        ? { subgraphHash: patch.baseSubgraphHash }
        : {}),
    },
    targetNodeIds,
  };
}

function targetNodeIdsForRebase(patch: AutomationPatchV1): string[] {
  return targetNodeIds(patch);
}

