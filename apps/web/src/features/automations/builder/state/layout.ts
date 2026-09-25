import type { EditorLayout, WorkflowGraphV2 } from "../../definition/schema-v2";

export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 96;

type ElkNode = {
  id: string;
  x?: number;
  y?: number;
  width: number;
  height: number;
};

type ElkGraph = {
  id: string;
  layoutOptions: Record<string, string>;
  children: ElkNode[];
  edges: Array<{ id: string; sources: string[]; targets: string[] }>;
};

/** Lazy-load elkjs only when the recruiter asks to auto-arrange. */
export async function layoutGraph(
  graph: WorkflowGraphV2,
  measured?: Record<string, { width: number; height: number }>,
): Promise<EditorLayout["positions"]> {
  const mod = (await import("elkjs/lib/elk.bundled.js")) as unknown as {
    default?: new () => { layout: (g: ElkGraph) => Promise<ElkGraph> };
  };
  const ELK = mod.default ?? (mod as unknown as new () => { layout: (g: ElkGraph) => Promise<ElkGraph> });
  const elk = new ELK();
  const laidOut = await elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.spacing.nodeNode": "64",
      "elk.layered.spacing.nodeNodeBetweenLayers": "96",
    },
    children: graph.nodes.map((node) => ({
      id: node.id,
      width: measured?.[node.id]?.width ?? NODE_WIDTH,
      height: measured?.[node.id]?.height ?? NODE_HEIGHT,
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  });
  const positions: EditorLayout["positions"] = {};
  for (const child of laidOut.children ?? []) {
    positions[child.id] = { x: child.x ?? 0, y: child.y ?? 0 };
  }
  return positions;
}
