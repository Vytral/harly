import { outputPorts as sourcePorts } from "../../definition/ports";
export { outputPorts as sourcePorts } from "../../definition/ports";
import { emptyLayout, type EditorLayout, type WorkflowEdge, type WorkflowGraphV2, type WorkflowNode } from "../../definition/schema-v2";

export type EditorSnapshot = {
  graph: WorkflowGraphV2;
  layout: EditorLayout;
};

export function newGraphId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function primaryPort(node: WorkflowNode): string | null {
  const ports = sourcePorts(node);
  return ports[0] ?? null;
}

/** Find the most natural open output for appending a newly added block. */
export function appendConnection(
  graph: WorkflowGraphV2,
  preferredSourceId?: string,
): { source: string; port: string } | null {
  const candidates = [
    ...(preferredSourceId ? graph.nodes.filter((node) => node.id === preferredSourceId) : []),
    ...[...graph.nodes].reverse().filter((node) => node.id !== preferredSourceId),
  ];
  for (const node of candidates) {
    const port = primaryPort(node);
    if (!port || node.type === "end") continue;
    if (graph.edges.some((edge) => edge.source === node.id && edge.port === port)) continue;
    return { source: node.id, port };
  }
  return null;
}

function clone(snapshot: EditorSnapshot): EditorSnapshot {
  return {
    graph: {
      ...snapshot.graph,
      nodes: snapshot.graph.nodes.map((node) => ({ ...node })),
      edges: snapshot.graph.edges.map((edge) => ({ ...edge })),
    },
    layout: {
      positions: { ...snapshot.layout.positions },
      collapsedNodeIds: [...snapshot.layout.collapsedNodeIds],
    },
  };
}

function reaches(graph: WorkflowGraphV2, from: string, to: string): boolean {
  const adj = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const list = adj.get(edge.source) ?? [];
    list.push(edge.target);
    adj.set(edge.source, list);
  }
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === to) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of adj.get(id) ?? []) stack.push(next);
  }
  return false;
}

export function explainConnect(
  graph: WorkflowGraphV2,
  source: string,
  port: string,
  target: string,
): string | null {
  if (source === target) return "A step cannot connect to itself.";
  const sourceNode = graph.nodes.find((node) => node.id === source);
  const targetNode = graph.nodes.find((node) => node.id === target);
  if (!sourceNode || !targetNode) return "That step is missing.";
  if (targetNode.type === "trigger") return "Nothing can connect back to the trigger.";
  if (!sourcePorts(sourceNode).includes(port) && !(sourceNode.type === "action" && port === "error")) {
    return `Port “${port}” is not valid on this step.`;
  }
  if (graph.edges.some((edge) => edge.source === source && edge.port === port)) {
    return "This output is already connected.";
  }
  if (reaches(graph, target, source)) return "That connection would create a cycle.";
  return null;
}

export function addNode(
  snapshot: EditorSnapshot,
  node: WorkflowNode,
  position: { x: number; y: number },
): EditorSnapshot {
  const next = clone(snapshot);
  next.graph.nodes.push(node);
  next.layout.positions[node.id] = position;
  return next;
}

export function moveNodes(
  snapshot: EditorSnapshot,
  positions: Record<string, { x: number; y: number }>,
): EditorSnapshot {
  const next = clone(snapshot);
  next.layout.positions = { ...next.layout.positions, ...positions };
  return next;
}

export function connectNodes(
  snapshot: EditorSnapshot,
  input: { source: string; port: string; target: string },
): { ok: true; snapshot: EditorSnapshot } | { ok: false; reason: string } {
  let working = snapshot;
  const sourceNode = snapshot.graph.nodes.find((node) => node.id === input.source);
  if (sourceNode?.type === "action" && input.port === "error" && sourceNode.failurePolicy !== "route_error") {
    working = updateNode(snapshot, {
      ...sourceNode,
      failurePolicy: "route_error",
    });
  }
  const reason = explainConnect(working.graph, input.source, input.port, input.target);
  if (reason) return { ok: false, reason };
  const next = clone(working);
  const edge: WorkflowEdge = {
    id: newGraphId("e"),
    source: input.source,
    port: input.port,
    target: input.target,
  };
  next.graph.edges.push(edge);
  return { ok: true, snapshot: next };
}

export function disconnectEdge(snapshot: EditorSnapshot, edgeId: string): EditorSnapshot {
  const next = clone(snapshot);
  next.graph.edges = next.graph.edges.filter((edge) => edge.id !== edgeId);
  return next;
}

export function insertOnEdge(
  snapshot: EditorSnapshot,
  edgeId: string,
  node: WorkflowNode,
): { ok: true; snapshot: EditorSnapshot } | { ok: false; reason: string } {
  const edge = snapshot.graph.edges.find((item) => item.id === edgeId);
  if (!edge) return { ok: false, reason: "That connection is gone." };
  const port = primaryPort(node);
  if (!port) return { ok: false, reason: "This block has no output to continue the flow." };
  const sourcePos = snapshot.layout.positions[edge.source] ?? { x: 0, y: 0 };
  const targetPos = snapshot.layout.positions[edge.target] ?? { x: 0, y: 160 };
  let next = addNode(snapshot, node, {
    x: Math.round((sourcePos.x + targetPos.x) / 2),
    y: Math.round((sourcePos.y + targetPos.y) / 2),
  });
  next = disconnectEdge(next, edgeId);
  const first = connectNodes(next, { source: edge.source, port: edge.port, target: node.id });
  if (!first.ok) return first;
  return connectNodes(first.snapshot, { source: node.id, port, target: edge.target });
}

export function deleteNodes(snapshot: EditorSnapshot, nodeIds: string[]): EditorSnapshot {
  const blocked = new Set(nodeIds.filter((id) => {
    const node = snapshot.graph.nodes.find((item) => item.id === id);
    return node?.type === "trigger" || id === snapshot.graph.entryNodeId;
  }));
  const removing = new Set(nodeIds.filter((id) => !blocked.has(id)));
  if (removing.size === 0) return snapshot;
  const next = clone(snapshot);

  for (const id of removing) {
    const incoming = next.graph.edges.filter((edge) => edge.target === id && !removing.has(edge.source));
    const outgoing = next.graph.edges.filter((edge) => edge.source === id && !removing.has(edge.target));
    if (incoming.length === 1 && outgoing.length === 1) {
      const inEdge = incoming[0]!;
      const outEdge = outgoing[0]!;
      next.graph.edges.push({
        id: newGraphId("e"),
        source: inEdge.source,
        port: inEdge.port,
        target: outEdge.target,
      });
    }
  }

  next.graph.nodes = next.graph.nodes.filter((node) => !removing.has(node.id));
  next.graph.edges = next.graph.edges.filter(
    (edge) => !removing.has(edge.source) && !removing.has(edge.target),
  );
  for (const id of removing) delete next.layout.positions[id];
  next.layout.collapsedNodeIds = next.layout.collapsedNodeIds.filter((id) => !removing.has(id));
  return next;
}

export function duplicateNodes(snapshot: EditorSnapshot, nodeIds: string[]): EditorSnapshot {
  const selected = snapshot.graph.nodes.filter(
    (node) => nodeIds.includes(node.id) && node.type !== "trigger",
  );
  if (selected.length === 0) return snapshot;
  const idMap = new Map<string, string>();
  for (const node of selected) idMap.set(node.id, newGraphId("n"));
  let next = clone(snapshot);
  for (const node of selected) {
    const newId = idMap.get(node.id)!;
    const copy = structuredClone(node) as WorkflowNode;
    copy.id = newId;
    if (copy.type === "action") {
      const remapped = { ...copy.input };
      for (const [key, binding] of Object.entries(remapped)) {
        if (binding.kind === "output" && idMap.has(binding.nodeId)) {
          remapped[key] = { ...binding, nodeId: idMap.get(binding.nodeId)! };
        }
      }
      copy.input = remapped;
    }
    const pos = snapshot.layout.positions[node.id] ?? { x: 0, y: 0 };
    next = addNode(next, copy, { x: pos.x + 48, y: pos.y + 48 });
  }
  const selectedSet = new Set(idMap.keys());
  for (const edge of snapshot.graph.edges) {
    if (!selectedSet.has(edge.source) || !selectedSet.has(edge.target)) continue;
    next.graph.edges.push({
      id: newGraphId("e"),
      source: idMap.get(edge.source)!,
      port: edge.port,
      target: idMap.get(edge.target)!,
    });
  }
  return next;
}

export function updateNode(snapshot: EditorSnapshot, node: WorkflowNode): EditorSnapshot {
  const next = clone(snapshot);
  next.graph.nodes = next.graph.nodes.map((item) => (item.id === node.id ? node : item));
  return next;
}

export function applyLayout(snapshot: EditorSnapshot, positions: EditorLayout["positions"]): EditorSnapshot {
  const next = clone(snapshot);
  next.layout = { ...next.layout, positions: { ...next.layout.positions, ...positions } };
  return next;
}

export function emptySnapshot(graph: WorkflowGraphV2, layout?: EditorLayout): EditorSnapshot {
  return { graph, layout: layout ?? emptyLayout() };
}
