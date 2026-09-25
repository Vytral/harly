import type { Action, ActionType, Trigger } from "./schema";
import { UNTITLED_WORKFLOW_NAME } from "./schema";
import type { WorkflowGraphV2 } from "./definition/schema-v2";
import { validateGraph } from "./definition/validate";
import { validateEraseCandidatePublishRules } from "./erase-policy";

/**
 * Per-node publish errors. `nodeId` is stable for the v1 linear recipe
 * (`name`, `trigger`, `actions`, `action:N`) so the builder can point at a step
 * without a graph compiler.
 */
export type WorkflowValidationIssue = {
  nodeId: string;
  fieldPath: string;
  message: string;
};

export type PublishActionHandler = {
  schema: {
    safeParse: (data: unknown) =>
      | { success: true }
      | {
          success: false;
          error: { issues: Array<{ path: PropertyKey[]; message: string }> };
        };
  };
};

export type PublishToolResolver = (
  type: ActionType,
  toolVersion: number,
) => PublishActionHandler | undefined;

type TriggerContext = "application" | "candidate" | "interview" | "job";

const TRIGGER_CONTEXT: Partial<Record<Trigger["event"], TriggerContext[]>> = {
  "application.created": ["application", "candidate", "job"],
  "application.stage_changed": ["application", "candidate", "job"],
  "application.status_changed": ["application", "candidate", "job"],
  "application.hired": ["application", "candidate", "job"],
  "application.rejected": ["application", "candidate", "job"],
  "candidate.created": ["candidate"],
  "candidate.updated": ["candidate"],
  "interview.scheduled": ["interview", "application", "candidate", "job"],
  "interview.rescheduled": ["interview", "application", "candidate", "job"],
  "interview.completed": ["interview", "application", "candidate", "job"],
  "interview.canceled": ["interview", "application", "candidate", "job"],
  "job.published": ["job"],
  "evaluation.completed": ["application", "candidate", "job"],
};

const ACTION_CONTEXT: Partial<Record<ActionType, TriggerContext[]>> = {
  move_stage: ["application"],
  set_status: ["application"],
  add_note: ["candidate"],
  add_tag: ["candidate"],
  remove_tag: ["candidate"],
  erase_candidate_data: ["candidate"],
  request_documents: ["application", "candidate"],
  generate_document: ["application", "candidate"],
  send_document_for_signature: ["application", "candidate"],
  schedule_interview: ["application", "candidate"],
  create_offer: ["application", "candidate"],
};

function validateTriggerActionCompatibility(
  graph: WorkflowGraphV2,
): WorkflowValidationIssue[] {
  const trigger = graph.nodes.find((node) => node.type === "trigger");
  if (!trigger) return [];
  const available = new Set(TRIGGER_CONTEXT[trigger.event] ?? []);
  const issues: WorkflowValidationIssue[] = [];
  for (const node of graph.nodes) {
    if (node.type !== "action") continue;
    const explicitlyBound = new Set(
      Object.entries(node.input)
        .filter(
          ([, binding]) => binding.kind !== "literal" || binding.value !== "",
        )
        .map(([field]) => field),
    );
    const required = [
      ...(ACTION_CONTEXT[node.actionType] ?? []),
      ...(node.actionType === "reschedule_interview" ||
      node.actionType === "cancel_interview"
        ? ["interview" as const]
        : []),
      ...((node.actionType === "send_email" ||
        node.actionType === "send_booking_link") &&
      !explicitlyBound.has("toEmail")
        ? ["candidate" as const]
        : []),
    ];
    const missing = required.filter((context) => {
      if (available.has(context)) return false;
      if (context === "application" && explicitlyBound.has("applicationId"))
        return false;
      if (context === "candidate" && explicitlyBound.has("candidateId"))
        return false;
      if (context === "interview" && explicitlyBound.has("interviewId"))
        return false;
      return true;
    });
    if (missing.length > 0) {
      issues.push({
        nodeId: node.id,
        fieldPath: "actionType",
        message: `This trigger does not guarantee the ${missing.join(" and ")} required by ${node.actionType.replaceAll("_", " ")}. Choose a compatible trigger or bind the missing record id.`,
      });
    }
  }
  return issues;
}

function nameIssue(name: string): WorkflowValidationIssue[] {
  return name.trim() && name.trim() !== UNTITLED_WORKFLOW_NAME
    ? []
    : [
        {
          nodeId: "name",
          fieldPath: "name",
          message: "Name this recipe before publishing.",
        },
      ];
}

/**
 * Graph-native publish preflight. A v2 graph must not be projected through
 * the legacy WHEN/IF/THEN shape: that projection follows one path and can
 * hide an unavailable action on another branch. Structural validation and
 * handler availability therefore inspect every graph node directly.
 */
export function validateGraphForPublish(
  workflow: { name: string; graph: WorkflowGraphV2 },
  getHandler: PublishToolResolver,
): WorkflowValidationIssue[] {
  const issues: WorkflowValidationIssue[] = [...nameIssue(workflow.name)];
  issues.push(...validateGraph(workflow.graph));
  issues.push(...validateTriggerActionCompatibility(workflow.graph));

  const actionNodes = workflow.graph.nodes.filter(
    (node) => node.type === "action",
  );
  if (actionNodes.length === 0) {
    issues.push({
      nodeId: "actions",
      fieldPath: "nodes",
      message: "Add at least one action before publishing.",
    });
  }
  issues.push(...validateGraphActionInputs(workflow.graph, getHandler));
  issues.push(...validateEraseCandidatePublishRules(workflow.graph));
  return issues;
}

/**
 * Validates action configuration without pretending runtime bindings are
 * concrete values. Literal bindings are parsed as-is; dynamic bindings use a
 * non-empty probe and only errors rooted at those dynamic fields are deferred
 * to execution, where the resolved value is validated again by the handler.
 */
export function validateGraphActionInputs(
  graph: WorkflowGraphV2,
  getHandler: PublishToolResolver,
): WorkflowValidationIssue[] {
  const issues: WorkflowValidationIssue[] = [];
  for (const node of graph.nodes) {
    if (node.type !== "action") continue;
    const handler = getHandler(node.actionType, node.toolVersion);
    if (!handler) {
      issues.push({
        nodeId: node.id,
        fieldPath: "actionType",
        message: `${node.actionType} tool version ${node.toolVersion} is not available to run.`,
      });
      continue;
    }

    const dynamicFields = new Set<string>();
    const probeInput = Object.fromEntries(
      Object.entries(node.input).map(([field, binding]) => {
        if (binding.kind === "literal") return [field, binding.value];
        dynamicFields.add(field);
        return [field, "workflow-binding@example.test"];
      }),
    );
    const parsed = handler.schema.safeParse(probeInput);
    if (parsed.success) continue;

    for (const issue of parsed.error.issues) {
      const rootField = issue.path[0];
      if (typeof rootField === "string" && dynamicFields.has(rootField))
        continue;
      const path = issue.path.map(String).filter(Boolean).join(".");
      issues.push({
        nodeId: node.id,
        fieldPath: path ? `input.${path}` : "input",
        message: issue.message,
      });
    }
  }
  return issues;
}

export function validateWorkflowForPublish(
  workflow: { name: string; trigger: Trigger; actions: Action[] },
  getHandler: (type: ActionType) => PublishActionHandler | undefined,
): WorkflowValidationIssue[] {
  const issues: WorkflowValidationIssue[] = [...nameIssue(workflow.name)];
  if (workflow.actions.length === 0) {
    issues.push({
      nodeId: "actions",
      fieldPath: "actions",
      message: "Add at least one action before publishing.",
    });
  }

  workflow.actions.forEach((action, index) => {
    const handler = getHandler(action.type);
    if (!handler) {
      issues.push({
        nodeId: `action:${index}`,
        fieldPath: "type",
        message: `${action.type} is not available to run.`,
      });
      return;
    }
    const parsed = handler.schema.safeParse(action.config);
    if (parsed.success) return;
    for (const issue of parsed.error.issues) {
      const path = issue.path.map(String).filter(Boolean).join(".");
      issues.push({
        nodeId: `action:${index}`,
        fieldPath: path ? `config.${path}` : "config",
        message: `Action ${index + 1}: ${issue.message}`,
      });
    }
  });

  return issues;
}

/**
 * Deduplicate issues stably by nodeId + fieldPath + message (AI08).
 * Preserves insertion order of the first occurrence.
 */
export function deduplicateValidationIssues<T extends WorkflowValidationIssue>(
  issues: readonly T[],
): T[] {
  const seen = new Set<string>();
  const deduplicated: T[] = [];
  for (const issue of issues) {
    const key = `${issue.nodeId}:::${issue.fieldPath}:::${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduplicated.push(issue);
  }
  return deduplicated;
}
