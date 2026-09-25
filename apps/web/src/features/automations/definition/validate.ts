import type { GraphValidationIssue } from "./issues";
import {
  MAX_CONDITION_DEPTH,
  MAX_CONDITION_LEAVES,
  MAX_EDGES,
  MAX_GRAPH_BYTES,
  MAX_NODES,
} from "./limits";
import { workflowGraphV2Schema, type WorkflowGraphV2, type WorkflowNode } from "./schema-v2";
import { outputPorts as allowedPorts, outputPorts as requiredPorts } from "./ports";
import { isWorkflowEvent } from "../schema";

export type { GraphValidationIssue };

function issue(
  nodeId: string,
  fieldPath: string,
  message: string,
): GraphValidationIssue {
  return { nodeId, fieldPath, message };
}

function countConditionLeaves(tree: unknown, depth = 0): { leaves: number; maxDepth: number } {
  if (!tree || typeof tree !== "object") return { leaves: 0, maxDepth: depth };
  const node = tree as { type?: string; children?: unknown[]; child?: unknown };
  if (node.type === "leaf") return { leaves: 1, maxDepth: depth };
  if (node.type === "not") return countConditionLeaves(node.child, depth + 1);
  if ((node.type === "and" || node.type === "or") && Array.isArray(node.children)) {
    return node.children.reduce<{ leaves: number; maxDepth: number }>(
      (acc, child) => {
        const next = countConditionLeaves(child, depth + 1);
        return {
          leaves: acc.leaves + next.leaves,
          maxDepth: Math.max(acc.maxDepth, next.maxDepth),
        };
      },
      { leaves: 0, maxDepth: depth },
    );
  }
  if (Array.isArray(tree)) {
    return tree.reduce<{ leaves: number; maxDepth: number }>(
      (acc, child) => {
        const next = countConditionLeaves(child, depth);
        return {
          leaves: acc.leaves + next.leaves,
          maxDepth: Math.max(acc.maxDepth, next.maxDepth),
        };
      },
      { leaves: 0, maxDepth: depth },
    );
  }
  return { leaves: 0, maxDepth: depth };
}

function adjacency(graph: WorkflowGraphV2): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const node of graph.nodes) map.set(node.id, []);
  for (const edge of graph.edges) {
    const list = map.get(edge.source) ?? [];
    list.push(edge.target);
    map.set(edge.source, list);
  }
  return map;
}

function hasCycle(graph: WorkflowGraphV2): string[] {
  const adj = adjacency(graph);
  const color = new Map<string, 0 | 1 | 2>();
  const cyclic: string[] = [];
  function dfs(id: string) {
    color.set(id, 1);
    for (const next of adj.get(id) ?? []) {
      const state = color.get(next) ?? 0;
      if (state === 1) cyclic.push(id);
      else if (state === 0) dfs(next);
    }
    color.set(id, 2);
  }
  for (const node of graph.nodes) {
    if ((color.get(node.id) ?? 0) === 0) dfs(node.id);
  }
  return cyclic;
}

function reachableFrom(graph: WorkflowGraphV2, start: string): Set<string> {
  const adj = adjacency(graph);
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of adj.get(id) ?? []) stack.push(next);
  }
  return seen;
}

function predecessors(graph: WorkflowGraphV2): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const node of graph.nodes) map.set(node.id, []);
  for (const edge of graph.edges) {
    const list = map.get(edge.target) ?? [];
    list.push(edge.source);
    map.set(edge.target, list);
  }
  return map;
}

/** Immediate dominators approximated by intersecting predecessor dominator sets. */
export function dominatorsOf(graph: WorkflowGraphV2): Map<string, Set<string>> {
  const ids = graph.nodes.map((node) => node.id);
  const preds = predecessors(graph);
  const dom = new Map<string, Set<string>>();
  const entry = graph.entryNodeId;
  for (const id of ids) {
    dom.set(id, id === entry ? new Set([entry]) : new Set(ids));
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of ids) {
      if (id === entry) continue;
      const incoming = preds.get(id) ?? [];
      if (incoming.length === 0) {
        const next = new Set([id]);
        if (next.size !== (dom.get(id)?.size ?? 0)) {
          dom.set(id, next);
          changed = true;
        }
        continue;
      }
      let intersection = new Set(dom.get(incoming[0]!) ?? []);
      for (const pred of incoming.slice(1)) {
        const set = dom.get(pred) ?? new Set();
        intersection = new Set([...intersection].filter((item) => set.has(item)));
      }
      intersection.add(id);
      const prev = dom.get(id) ?? new Set();
      if (intersection.size !== prev.size || [...intersection].some((item) => !prev.has(item))) {
        dom.set(id, intersection);
        changed = true;
      }
    }
  }
  return dom;
}

export function validateGraph(input: unknown): GraphValidationIssue[] {
  const issues: GraphValidationIssue[] = [];
  let encoded: string;
  try { encoded = JSON.stringify(input ?? {}) ?? ""; }
  catch { return [issue("graph", "graph", "Graph must be serializable JSON.")]; }
  if (new TextEncoder().encode(encoded).byteLength > MAX_GRAPH_BYTES) {
    issues.push(issue("graph", "graph", "Graph exceeds the 1 MiB payload limit."));
    return issues;
  }

  const parsed = workflowGraphV2Schema.safeParse(input);
  if (!parsed.success) {
    for (const item of parsed.error.issues) {
      issues.push(issue("graph", item.path.map(String).join(".") || "graph", item.message));
    }
    return issues;
  }
  const graph = parsed.data;
  if (graph.nodes.length > MAX_NODES) {
    issues.push(issue("graph", "nodes", `A workflow can have at most ${MAX_NODES} steps.`));
  }
  if (graph.edges.length > MAX_EDGES) {
    issues.push(issue("graph", "edges", `A workflow can have at most ${MAX_EDGES} connections.`));
  }

  const byId = new Map<string, WorkflowNode>();
  for (const node of graph.nodes) {
    if (byId.has(node.id)) {
      issues.push(issue(node.id, "id", "Duplicate step id."));
      continue;
    }
    byId.set(node.id, node);
    if (node.type === "condition") {
      const stats = countConditionLeaves(node.tree);
      if (stats.leaves > MAX_CONDITION_LEAVES) {
        issues.push(issue(node.id, "tree", "This condition has too many clauses."));
      }
      if (stats.maxDepth > MAX_CONDITION_DEPTH) {
        issues.push(issue(node.id, "tree", "This condition nests too deeply."));
      }
    }
  }

  const triggers = graph.nodes.filter((node) => node.type === "trigger");
  if (triggers.length !== 1) {
    issues.push(issue("graph", "nodes", "A workflow must have exactly one trigger."));
  }
  if (!byId.has(graph.entryNodeId)) {
    issues.push(issue("graph", "entryNodeId", "The entry step does not exist."));
  } else if (byId.get(graph.entryNodeId)?.type !== "trigger") {
    issues.push(issue(graph.entryNodeId, "type", "The entry step must be the trigger."));
  }

  const edgeKeys = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.source === edge.target) {
      issues.push(issue(edge.source, "edges", "A step cannot connect to itself."));
    }
    const key = `${edge.source}:${edge.port}`;
    if (edgeKeys.has(key)) {
      issues.push(issue(edge.source, `ports.${edge.port}`, "This output is already connected."));
    }
    edgeKeys.add(key);
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source) {
      issues.push(issue(edge.source, "edges", "Connection source is missing."));
      continue;
    }
    if (!target) {
      issues.push(issue(edge.source, "edges", "Connection target is missing."));
      continue;
    }
    if (target.type === "trigger") {
      issues.push(issue(edge.source, "edges", "Nothing can connect back to the trigger."));
    }
    if (!allowedPorts(source).includes(edge.port)) {
      issues.push(issue(source.id, `ports.${edge.port}`, `Port “${edge.port}” is not valid on this step.`));
    }
  }

  for (const node of graph.nodes) {
    if (node.type === "end") continue;
    for (const port of requiredPorts(node)) {
      if (!edgeKeys.has(`${node.id}:${port}`)) {
        issues.push(issue(node.id, `ports.${port}`, `Connect the “${port}” output.`));
      }
    }
  }

  for (const id of hasCycle(graph)) {
    issues.push(issue(id, "edges", "Cycles are not allowed."));
  }

  if (byId.has(graph.entryNodeId)) {
    const reachable = reachableFrom(graph, graph.entryNodeId);
    for (const node of graph.nodes) {
      if (!reachable.has(node.id)) {
        issues.push(issue(node.id, "id", "This step is not reachable from the trigger."));
      }
    }
    for (const node of graph.nodes) {
      if (!reachable.has(node.id) || node.type === "end") continue;
      const outs = graph.edges.filter((edge) => edge.source === node.id);
      if (outs.length === 0) {
        issues.push(issue(node.id, "edges", "Every path must end at an explicit End step."));
      }
    }
  }

  const dominators = dominatorsOf(graph);
  for (const node of graph.nodes) {
    const bindings = node.type === "action"
      ? Object.entries(node.input).map(([field, binding]) => [`input.${field}`, binding] as const)
      : node.type === "wait" && node.resourceId ? [["resourceId", node.resourceId] as const] : [];
    if (node.type === "delay") {
      if (node.mode === "duration" && node.durationMs === undefined) {
        issues.push(issue(node.id, "durationMs", "Set how long this step should wait."));
      }
      if (node.mode === "next_local") {
        if (!node.localTime || !/^([01]\d|2[0-3]):[0-5]\d$/.test(node.localTime)) {
          issues.push(issue(node.id, "localTime", "Set a valid local time in HH:MM format."));
        }
        if (!node.timeZone?.trim()) {
          issues.push(issue(node.id, "timeZone", "Choose the time zone used by this delay."));
        } else {
          try {
            new Intl.DateTimeFormat("en-US", { timeZone: node.timeZone }).format();
          } catch {
            issues.push(issue(node.id, "timeZone", "Choose a valid IANA time zone, such as America/Santiago."));
          }
        }
      }
    }
    if (node.type === "wait") {
      if (node.kind === "event" && !node.eventName?.trim()) {
        issues.push(issue(node.id, "eventName", "Choose the event that should resume this step."));
      }
      if (node.kind === "event" && node.eventName?.trim() && !isWorkflowEvent(node.eventName)) {
        issues.push(issue(node.id, "eventName", "Choose an event supported by the workflow dispatcher."));
      }
      if (node.kind === "document_package" && !node.resourceId) {
        issues.push(issue(node.id, "resourceId", "Choose the application or document to monitor."));
      }
    }
    if (node.type === "approval" && node.eligibleActorIds.length === 0) {
      issues.push(issue(node.id, "eligibleActorIds", "Choose at least one person who can approve."));
    }
    for (const [field, binding] of bindings) {
      if (binding.kind !== "output") continue;
      if (!byId.has(binding.nodeId)) {
        issues.push(issue(node.id, field, "This binding points at a missing step."));
        continue;
      }
      const dom = dominators.get(node.id) ?? new Set();
      if (binding.nodeId === node.id || !dom.has(binding.nodeId)) {
        issues.push(
          issue(
            node.id,
            field,
            "This value comes from a branch that is not guaranteed to run.",
          ),
        );
      }
    }
  }

  return issues;
}

export function graphIsPublishable(graph: WorkflowGraphV2): boolean {
  return validateGraph(graph).length === 0;
}
