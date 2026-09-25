import type { Edge, Node } from "@xyflow/react";
import { MarkerType, Position } from "@xyflow/react";

import type { EditorLayout, WorkflowGraphV2, WorkflowNode } from "../../definition/schema-v2";
import { NODE_HEIGHT, NODE_WIDTH } from "./layout";
import type { EditorSelection } from "./editor-reducer";

export type CanvasNodeData = {
  node: WorkflowNode;
  isDropTarget?: boolean;
  connectedPorts?: string[];
  isNew?: boolean;
};

export function graphToFlow(
  graph: WorkflowGraphV2,
  layout: EditorLayout,
  selection: EditorSelection,
): { nodes: Node<CanvasNodeData>[]; edges: Edge[] } {
  const selectedNodes = new Set(selection.nodeIds);
  const selectedEdges = new Set(selection.edgeIds);

  const edgesBySource = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (!edgesBySource.has(edge.source)) edgesBySource.set(edge.source, new Set());
    edgesBySource.get(edge.source)!.add(edge.port);
  }

  const nodes: Node<CanvasNodeData>[] = graph.nodes.map((node, index) => {
    const connectedPorts = Array.from(edgesBySource.get(node.id) ?? []);
    return {
      id: node.id,
      type: "harly",
      position: layout.positions[node.id] ?? { x: 48, y: 72 + index * 180 },
      data: { node, connectedPorts },
      selected: selectedNodes.has(node.id),
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      style: { width: NODE_WIDTH, minHeight: NODE_HEIGHT },
    };
  });

  const edges: Edge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.port,
    targetHandle: "in",
    type: "harly",
    selected: selectedEdges.has(edge.id),
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "var(--foreground)" },
    data: { port: edge.port },
  }));
  return { nodes, edges };
}
