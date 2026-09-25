import type { WorkflowGraphV2, WorkflowNode } from "./definition/schema-v2";

/**
 * Destructive candidate erasure in automations.
 *
 * Two explicit modes (literal binding `executionMode`):
 * - `require_approval` (default): every path from the trigger to the erase
 *   action must pass through an approval node. Humans stay in control.
 * - `automatic`: allowed only when the workspace has data retention enabled
 *   (settings). Retention would purge the data eventually anyway; automation
 *   may do it earlier under that policy. Enforced at publish (when workspace
 *   is known) and again at runtime so a settings flip cannot be bypassed.
 */

export type EraseExecutionMode = "require_approval" | "automatic";

export type ErasePolicyIssue = {
  nodeId: string;
  fieldPath: string;
  message: string;
};

function isEraseAction(node: WorkflowNode): node is Extract<WorkflowNode, { type: "action" }> {
  return node.type === "action" && node.actionType === "erase_candidate_data";
}

/** Resolve mode from node input; unknown/missing → require_approval (safe default). */
export function eraseExecutionMode(
  input: Record<string, { kind: string; value?: unknown }>,
): EraseExecutionMode {
  const binding = input.executionMode;
  if (
    binding &&
    binding.kind === "literal" &&
    binding.value === "automatic"
  ) {
    return "automatic";
  }
  return "require_approval";
}

/**
 * True when there exists a path from entry → erase that never visits an
 * approval node. Such a path would let erasure run without a human gate.
 */
export function hasUnguardedPathToErase(
  graph: WorkflowGraphV2,
  eraseNodeId: string,
): boolean {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const adj = new Map<string, string[]>();
  for (const node of graph.nodes) adj.set(node.id, []);
  for (const edge of graph.edges) {
    const list = adj.get(edge.source) ?? [];
    list.push(edge.target);
    adj.set(edge.source, list);
  }

  type Frame = { id: string; sawApproval: boolean };
  const queue: Frame[] = [{ id: graph.entryNodeId, sawApproval: false }];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const frame = queue.shift()!;
    const key = `${frame.id}:${frame.sawApproval ? 1 : 0}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const node = byId.get(frame.id);
    if (!node) continue;

    const sawApproval =
      frame.sawApproval || node.type === "approval";

    if (frame.id === eraseNodeId) {
      if (!sawApproval) return true;
      continue;
    }

    for (const next of adj.get(frame.id) ?? []) {
      queue.push({ id: next, sawApproval });
    }
  }
  return false;
}

/** Structural publish rules (no DB). Retention for `automatic` is checked elsewhere. */
export function validateEraseCandidatePublishRules(
  graph: WorkflowGraphV2,
): ErasePolicyIssue[] {
  const issues: ErasePolicyIssue[] = [];
  for (const node of graph.nodes) {
    if (!isEraseAction(node)) continue;
    const mode = eraseExecutionMode(node.input);
    if (mode === "require_approval" && hasUnguardedPathToErase(graph, node.id)) {
      issues.push({
        nodeId: node.id,
        fieldPath: "input.executionMode",
        message:
          "Erase candidate data requires an approval step on every path to this action, or set executionMode to automatic when workspace data retention is enabled.",
      });
    }
    if (mode === "automatic") {
      // Reminder only when mode is set; runtime + publish service enforce retention.
      const binding = node.input.executionMode;
      if (!binding || binding.kind !== "literal") {
        issues.push({
          nodeId: node.id,
          fieldPath: "input.executionMode",
          message:
            "Automatic erasure requires a literal executionMode of automatic.",
        });
      }
    }
  }
  return issues;
}

export function listAutomaticEraseNodeIds(graph: WorkflowGraphV2): string[] {
  return graph.nodes
    .filter(isEraseAction)
    .filter((node) => eraseExecutionMode(node.input) === "automatic")
    .map((node) => node.id);
}
