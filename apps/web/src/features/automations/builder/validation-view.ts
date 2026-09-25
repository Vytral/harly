import { actionMeta } from "./catalog";
import { nodeTitle } from "./node-copy";
import type { GraphValidationIssue } from "../definition/issues";
import type { WorkflowGraphV2, WorkflowNode } from "../definition/schema-v2";
import { validateGraph } from "../definition/validate";

export type VisibleIssue = GraphValidationIssue & {
  title: string;
  category: "connection" | "configuration";
  blockingPublish: boolean;
};

function traversalOrder(graph: WorkflowGraphV2): string[] {
  const adj = new Map<string, string[]>();
  for (const node of graph.nodes) adj.set(node.id, []);
  for (const edge of graph.edges) {
    const list = adj.get(edge.source) ?? [];
    list.push(edge.target);
    adj.set(edge.source, list);
  }
  const seen = new Set<string>();
  const order: string[] = [];
  const stack = [graph.entryNodeId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
    const next = adj.get(id) ?? [];
    for (let i = next.length - 1; i >= 0; i -= 1) stack.push(next[i]!);
  }
  for (const node of graph.nodes) {
    if (!seen.has(node.id)) order.push(node.id);
  }
  return order;
}

function literalMissing(node: Extract<WorkflowNode, { type: "action" }>, key: string): boolean {
  const binding = node.input?.[key];
  if (!binding) return true;
  if (binding.kind !== "literal") return false;
  if (binding.value === null || binding.value === "") return true;
  if (typeof binding.value === "string" && binding.value.trim() === "") return true;
  return false;
}

export function requiredConfigIssues(graph: WorkflowGraphV2): GraphValidationIssue[] {
  const issues: GraphValidationIssue[] = [];
  for (const node of graph.nodes) {
    if (node.type !== "action") continue;
    const meta = actionMeta(node.actionType);
    if (!meta) continue;

    // Cross-field validation: send_email requires template OR (subject and body)
    if (node.actionType === "send_email") {
      const hasTemplate = !literalMissing(node, "templateId");
      const hasSubject = !literalMissing(node, "subject");
      const hasBody = !literalMissing(node, "body");
      if (!hasTemplate && (!hasSubject || !hasBody)) {
        issues.push({
          nodeId: node.id,
          fieldPath: "input.templateId",
          message: "Choose an email template or write a subject and body.",
        });
      }
    }

    for (const field of meta.config) {
      if (!("required" in field) || !field.required) continue;
      if (literalMissing(node, field.key)) {
        issues.push({
          nodeId: node.id,
          fieldPath: `input.${field.key}`,
          message: `Fill in ${field.label}.`,
        });
      }
    }
  }
  return issues;
}

export function visibleIssues(graph: WorkflowGraphV2): VisibleIssue[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const order = traversalOrder(graph);
  const rank = new Map(order.map((id, index) => [id, index]));
  const structural = validateGraph(graph);
  const required = requiredConfigIssues(graph);
  const merged = [
    ...structural.map((issue) => ({ ...issue, category: "connection" as const, blockingPublish: true })),
    ...required.map((issue) => ({ ...issue, category: "configuration" as const, blockingPublish: true })),
  ];
  return merged
    .map((issue) => ({
      ...issue,
      title: byId.get(issue.nodeId) ? nodeTitle(byId.get(issue.nodeId)!) : "Automation",
    }))
    .sort((a, b) => {
      const ra = rank.get(a.nodeId) ?? Number.MAX_SAFE_INTEGER;
      const rb = rank.get(b.nodeId) ?? Number.MAX_SAFE_INTEGER;
      if (ra !== rb) return ra - rb;
      return a.message.localeCompare(b.message);
    });
}

export function looksLikeRawJson(message: string): boolean {
  const trimmed = message.trim();
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  );
}
