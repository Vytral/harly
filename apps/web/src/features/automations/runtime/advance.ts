import type { CompiledPlan } from "../definition/compile";
import { outputPorts } from "../definition/ports";
import { isSafeBindingPath, type Binding, type JsonValue, type WorkflowNode } from "../definition/schema-v2";

export type NodeOutcome =
  | { status: "succeeded"; output: JsonValue; port?: string; providerRef?: string }
  | {
      status: "failed";
      code: string;
      retryable?: boolean;
      providerRef?: string;
      details?: NodeErrorDetails;
    }
  | { status: "uncertain"; code: string; providerRef?: string; details?: NodeErrorDetails };

export type NodeErrorDetails = {
  message?: string;
  fieldPath?: string;
  category?: "validation" | "authorization" | "not_found" | "configuration" | "provider" | "network" | "policy" | "unknown";
  retryAdvice?: "never" | "after_backoff" | "reconcile" | "fix_configuration";
};

/** Durable adapters load this snapshot under their lease; simulations use fixtures. */
export type ExecutionSnapshot = {
  contentHash: string;
  nodeId: string;
  trigger: JsonValue;
  outcomes: Record<string, NodeOutcome>;
  warnings: string[];
  cancelled: boolean;
  /** Set by durable retry scheduling; keeps retry intent across workers. */
  retryNodeId?: string | null;
};

export type AdvanceDecision =
  | { type: "next"; nodeId: string; warnings: string[] }
  | { type: "action"; node: Extract<WorkflowNode, { type: "action" }>; input: Record<string, JsonValue> }
  | { type: "condition"; node: Extract<WorkflowNode, { type: "condition" }> }
  | { type: "wait"; node: Extract<WorkflowNode, { type: "delay" | "approval" | "wait" }>; resourceId?: string }
  | { type: "finish"; status: "succeeded" | "completed_with_warnings" | "stopped" | "failed" | "uncertain" | "cancelled"; code?: string };

/** No eval, prototype traversal, implicit coercion, or fallback for failed producers. */
function readPath(root: JsonValue, path: string): JsonValue | undefined {
  if (!isSafeBindingPath(path)) throw new Error("UNSAFE_BINDING_PATH");
  let value: JsonValue | undefined = root;
  for (const segment of path.split(".")) {
    if (value === null || typeof value !== "object" || Array.isArray(value) || !Object.hasOwn(value, segment)) return undefined;
    value = value[segment];
  }
  return value;
}

export function resolveBinding(binding: Binding, snapshot: ExecutionSnapshot, plan: CompiledPlan): JsonValue {
  if (binding.kind === "literal") return structuredClone(binding.value);
  let root = snapshot.trigger;
  if (binding.kind === "output") {
    if (binding.nodeId === snapshot.nodeId || !plan.dominators[snapshot.nodeId]?.includes(binding.nodeId)) throw new Error("OUTPUT_NOT_GUARANTEED");
    const outcome = Object.hasOwn(snapshot.outcomes, binding.nodeId) ? snapshot.outcomes[binding.nodeId] : undefined;
    if (!outcome || outcome.status !== "succeeded") throw new Error("OUTPUT_NOT_SUCCESSFUL");
    root = outcome.output;
  }
  const value = readPath(root, binding.path);
  if (value !== undefined) return structuredClone(value);
  if (binding.fallback !== undefined) return structuredClone(binding.fallback);
  throw new Error("MISSING_BINDING_VALUE");
}

/**
 * One active token, one decision. No DB, clock, provider calls, or hidden retries.
 * The worker must atomically persist a decision under its fence before advancing.
 * Action adapters validate tool input, permissions and effect keys before execution.
 * Wait adapters authorize/reconcile resolutions before persisting NodeOutcome.
 */
export function advance(plan: CompiledPlan, snapshot: ExecutionSnapshot): AdvanceDecision {
  if (snapshot.contentHash !== plan.contentHash) return { type: "finish", status: "failed", code: "VERSION_MISMATCH" };
  if (snapshot.cancelled) return { type: "finish", status: "cancelled" };
  const node = Object.hasOwn(plan.nodesById, snapshot.nodeId) ? plan.nodesById[snapshot.nodeId] : undefined;
  if (!node) return { type: "finish", status: "failed", code: "NODE_NOT_FOUND" };
  const next = (port: string, warnings = snapshot.warnings): AdvanceDecision => {
    const target = plan.ports[node.id]?.[port];
    return target && Object.hasOwn(plan.nodesById, target)
      ? { type: "next", nodeId: target, warnings: [...warnings] }
      : { type: "finish", status: "failed", code: "MISSING_CONNECTION" };
  };
  if (node.type === "trigger") return next("next");
  if (node.type === "end") return {
    type: "finish",
    status: node.result === "stopped" ? "stopped" : snapshot.warnings.length ? "completed_with_warnings" : "succeeded",
  };
  const outcome = Object.hasOwn(snapshot.outcomes, node.id) ? snapshot.outcomes[node.id] : undefined;
  if (outcome) {
    if (outcome.status === "uncertain") return { type: "finish", status: "uncertain", code: outcome.code };
    if (outcome.status === "failed" && snapshot.retryNodeId === node.id && node.type === "condition") {
      // Conditions are DB-backed reads. The worker may retry the same
      // evaluation after a transient context-load failure without moving the
      // graph cursor or fabricating a branch result.
      return { type: "condition", node };
    }
    if (outcome.status === "failed" && snapshot.retryNodeId === node.id && node.type === "action") {
      // Retry intent is persisted by the run store. Re-resolve from the
      // frozen trigger/producer outputs; node-store keeps prior attempts.
      try {
        const input: Record<string, JsonValue> = Object.create(null);
        for (const [key, binding] of Object.entries(node.input)) {
          if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("UNSAFE_INPUT_KEY");
          input[key] = resolveBinding(binding, snapshot, plan);
        }
        return { type: "action", node, input };
      } catch (error) {
        return { type: "finish", status: "failed", code: error instanceof Error ? error.message : "INVALID_INPUT" };
      }
    }
    if (outcome.status === "failed") {
      if (node.type === "action" && node.failurePolicy === "route_error") return next("error");
      if (node.type === "action" && node.failurePolicy === "continue") return next("success", [...snapshot.warnings, node.id]);
      return { type: "finish", status: "failed", code: outcome.code };
    }
    const ports = node.type === "action" ? ["success"] : outputPorts(node);
    const port = outcome.port ?? (node.type === "action" ? "success" : undefined);
    if (!port || !ports.includes(port)) return { type: "finish", status: "failed", code: "INVALID_RESOLUTION_PORT" };
    return next(port);
  }
  if (node.type === "condition") return { type: "condition", node };
  try {
    if (node.type === "action") {
      const input: Record<string, JsonValue> = Object.create(null);
      for (const [key, binding] of Object.entries(node.input)) {
        if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("UNSAFE_INPUT_KEY");
        input[key] = resolveBinding(binding, snapshot, plan);
      }
      return { type: "action", node, input };
    }
    if (node.type === "wait" && node.resourceId) {
      const resourceId = resolveBinding(node.resourceId, snapshot, plan);
      if (typeof resourceId !== "string" || !resourceId.trim()) throw new Error("INVALID_WAIT_RESOURCE");
      return { type: "wait", node, resourceId };
    }
    return { type: "wait", node };
  } catch (error) {
    return { type: "finish", status: "failed", code: error instanceof Error ? error.message : "INVALID_INPUT" };
  }
}
