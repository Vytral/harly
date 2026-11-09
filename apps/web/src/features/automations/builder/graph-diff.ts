import { nodeTitle } from "./node-copy";
import type { WorkflowGraphV2 } from "../definition/schema-v2";
import type { BuilderT } from "./catalog";

export type GraphStepSummary = {
  id: string;
  type: string;
  title: string;
};

export function summarizeGraph(graph: WorkflowGraphV2, t: BuilderT): GraphStepSummary[] {
  return graph.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    title: nodeTitle(node, t),
  }));
}

export type GraphDiffLine = {
  id: string;
  message: string;
};

export function diffGraphSummaries(
  local: GraphStepSummary[],
  server: GraphStepSummary[],
  t: BuilderT,
): GraphDiffLine[] {
  const localById = new Map(local.map((item) => [item.id, item]));
  const serverById = new Map(server.map((item) => [item.id, item]));
  const lines: GraphDiffLine[] = [];
  for (const item of local) {
    const other = serverById.get(item.id);
    if (!other) {
      lines.push({ id: item.id, message: t("graphDiff.onlyOnYourCopy", { title: item.title }) });
      continue;
    }
    if (other.title !== item.title || other.type !== item.type) {
      lines.push({
        id: item.id,
        message: t("graphDiff.titleChanged", { local: item.title, server: other.title }),
      });
    }
  }
  for (const item of server) {
    if (!localById.has(item.id)) {
      lines.push({ id: item.id, message: t("graphDiff.onlyOnServer", { title: item.title }) });
    }
  }
  if (lines.length === 0) {
    lines.push({
      id: "same",
      message: t("graphDiff.same"),
    });
  }
  return lines;
}
