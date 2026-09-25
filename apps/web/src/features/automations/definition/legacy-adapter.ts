import type { Action, Conditions, Trigger } from "../schema";
import { GRAPH_SCHEMA_VERSION } from "./limits";
import type {
  Binding,
  EditorLayout,
  JsonValue,
  LegacyRecipe,
  WorkflowEdge,
  WorkflowGraphV2,
  WorkflowNode,
} from "./schema-v2";
import { emptyLayout } from "./schema-v2";

type ActionNodeInferred = Extract<WorkflowNode, { type: "action" }>;

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true;
  const kind = typeof value;
  if (kind === "string" || kind === "number" || kind === "boolean") return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (kind === "object") {
    return Object.values(value as Record<string, unknown>).every(isJsonValue);
  }
  return false;
}

function literalsFromConfig(config: Record<string, unknown>): Record<string, Binding> {
  const input: Record<string, Binding> = {};
  for (const [key, value] of Object.entries(config)) {
    if (!isJsonValue(value)) continue;
    input[key] = { kind: "literal", value };
  }
  return input;
}

function configFromInput(input: Record<string, Binding>): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  for (const [key, binding] of Object.entries(input)) {
    if (binding.kind === "literal") config[key] = binding.value;
  }
  return config;
}

/**
 * v1 WHEN → IF → THEN becomes a linear graph. The false branch of IF, if the
 * tree is present, ends `stopped`. continueOnError maps to failurePolicy continue.
 */
export function legacyToGraph(recipe: LegacyRecipe): WorkflowGraphV2 {
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];

  nodes.push({
    id: "trigger",
    type: "trigger",
    event: recipe.trigger.event,
    filter: recipe.trigger.filter,
  });

  const hasCondition = (recipe.conditions ?? []).length > 0;
  if (hasCondition) {
    nodes.push({
      id: "condition",
      type: "condition",
      tree: recipe.conditions ?? [],
    });
  }

  recipe.actions.forEach((action, index) => {
    const node: ActionNodeInferred = {
      id: `action_${index}`,
      type: "action",
      actionType: action.type,
      toolVersion: 1,
      failurePolicy: action.continueOnError ? "continue" : "stop",
      input: literalsFromConfig(action.config ?? {}),
    };
    nodes.push(node);
  });

  nodes.push({ id: "end_completed", type: "end", result: "completed" });
  if (hasCondition) {
    nodes.push({ id: "end_stopped", type: "end", result: "stopped" });
  }

  const firstAfterTrigger = hasCondition
    ? "condition"
    : recipe.actions.length > 0
      ? "action_0"
      : "end_completed";
  edges.push({
    id: "e_trigger_next",
    source: "trigger",
    port: "next",
    target: firstAfterTrigger,
  });

  if (hasCondition) {
    const trueTarget = recipe.actions.length > 0 ? "action_0" : "end_completed";
    edges.push({
      id: "e_condition_true",
      source: "condition",
      port: "true",
      target: trueTarget,
    });
    edges.push({
      id: "e_condition_false",
      source: "condition",
      port: "false",
      target: "end_stopped",
    });
  }

  recipe.actions.forEach((_, index) => {
    const next = index + 1 < recipe.actions.length ? `action_${index + 1}` : "end_completed";
    edges.push({
      id: `e_action_${index}_success`,
      source: `action_${index}`,
      port: "success",
      target: next,
    });
  });

  return {
    schemaVersion: GRAPH_SCHEMA_VERSION,
    entryNodeId: "trigger",
    nodes,
    edges,
  };
}

export function graphToLegacy(graph: WorkflowGraphV2): LegacyRecipe {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, WorkflowEdge[]>();
  for (const edge of graph.edges) {
    const list = outgoing.get(edge.source) ?? [];
    list.push(edge);
    outgoing.set(edge.source, list);
  }

  const triggerNode = byId.get(graph.entryNodeId);
  const trigger: Trigger =
    triggerNode?.type === "trigger"
      ? { event: triggerNode.event, filter: triggerNode.filter }
      : { event: "application.created" };

  let conditions: Conditions = [];
  const actions: Action[] = [];
  const visited = new Set<string>();
  let cursor: string | undefined = graph.entryNodeId;

  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    const node = byId.get(cursor);
    if (!node || node.type === "end") break;
    if (node.type === "condition") {
      conditions = node.tree;
      cursor = (outgoing.get(cursor) ?? []).find((edge) => edge.port === "true")?.target;
      continue;
    }
    if (node.type === "action") {
      actions.push({
        type: node.actionType,
        config: configFromInput(node.input ?? {}),
        continueOnError: node.failurePolicy === "continue",
      });
    }
    const nextPort = node.type === "trigger" ? "next" : "success";
    cursor = (outgoing.get(cursor) ?? []).find((edge) => edge.port === nextPort)?.target;
  }

  return { trigger, conditions, actions };
}

export function defaultLayout(): EditorLayout {
  return emptyLayout();
}

export const LEGACY_ADAPTER_WARNINGS = [
  "The IF false branch ends the run as stopped; v1 skipped remaining actions the same way.",
  "continueOnError becomes failurePolicy continue and does not open an error port.",
] as const;
