/**
 * Natural-language preview of a workflow draft. Pure, client-safe — takes the
 * builder's draft shape (same as `WorkflowDefinitionInput`) and renders one
 * sentence: "When X, if Y, then Z." Used in the builder's read-only preview
 * strip and as the subtitle on list cards.
 *
 * Each sentence is a single translated message with placeholders. Lists are
 * joined by pairwise messages, so translators control the word order and the
 * conjunction.
 *
 * No secrets, no PII: config values are summarized, not dumped verbatim. Long
 * text (note/email bodies) is truncated to a preview.
 */

import type { Action, ConditionNode, FieldRef, Operator, Trigger, WorkflowEvent } from "../schema";
import type { WorkflowGraphV2, WorkflowNode } from "../definition/schema-v2";
import { actionMeta, operatorMeta, triggerMeta, type BuilderT } from "./catalog";

const BODY_PREVIEW = 60;

function quote(value: string): string {
  return value.length > BODY_PREVIEW ? `"${value.slice(0, BODY_PREVIEW).trim()}…"` : `"${value}"`;
}

/** Joins items as "a, b, c" with the comma pattern, then pairs the last item. */
function joinWith(items: string[], last: (left: string, right: string) => string, t: BuilderT): string {
  if (items.length === 0) return "";
  return items.slice(1).reduce((acc, item, index, rest) => {
    const isLast = index === rest.length - 1;
    return isLast ? last(acc, item) : t("preview.listComma", { left: acc, right: item });
  }, items[0]!);
}

function joinAnd(items: string[], t: BuilderT): string {
  return joinWith(items, (left, right) => t("preview.listAnd", { left, right }), t);
}

function joinOr(items: string[], t: BuilderT): string {
  return joinWith(items, (left, right) => t("preview.listOr", { left, right }), t);
}

function describeValue(value: unknown, t: BuilderT): string {
  if (value === null || value === undefined) return t("preview.nothing");
  if (typeof value === "string") return quote(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return t("preview.nothing");
    const items = value.map((v) => (typeof v === "string" ? quote(v) : String(v)));
    return joinOr(items, t);
  }
  return String(value);
}

function describeField(field: FieldRef, t: BuilderT): string {
  if (field.kind === "literal") return describeValue(field.value, t);
  return `${field.kind}.${field.path}`;
}

function describeLeaf(
  leaf: Extract<ConditionNode, { type: "leaf" }>,
  t: BuilderT,
): string {
  const op = operatorMeta(leaf.op as Operator, t);
  const field = describeField(leaf.field, t);
  if (!op.wantsValue) {
    // is_set / is_empty read as "X is set" / "X is empty".
    return t("preview.leafWithoutValue", { field, operator: op.label });
  }
  return t("preview.leafWithValue", { field, operator: op.label, value: describeValue(leaf.value, t) });
}

function describeNode(node: ConditionNode, t: BuilderT): string {
  switch (node.type) {
    case "leaf":
      return describeLeaf(node, t);
    case "and": {
      if (node.children.length === 0) return t("preview.always");
      const parts = node.children.map((c, i) => {
        const text = describeNode(c, t);
        // Wrap sub-groups (and/or/not) in parens so precedence reads.
        return i > 0 && (c.type === "and" || c.type === "or") ? `(${text})` : text;
      });
      return joinAnd(parts, t);
    }
    case "or": {
      if (node.children.length === 0) return t("preview.never");
      const parts = node.children.map((c) => {
        const text = describeNode(c, t);
        return c.type === "and" ? `(${text})` : text;
      });
      return joinOr(parts, t);
    }
    case "not":
      return t("preview.not", { condition: describeNode(node.child, t) });
  }
}

/** Render a list of root condition nodes as "if …" text. Empty = "always". */
export function describeConditions(roots: ConditionNode[] | undefined, t: BuilderT): string {
  if (!roots || roots.length === 0) return t("preview.always");
  if (roots.length === 1) return describeNode(roots[0]!, t);
  // Multiple roots = implicit AND (conditionsSchema normalizes to array).
  return joinAnd(roots.map((r) => describeNode(r, t)), t);
}

/** Trigger phrase, with the filter appended when there is one. */
export function describeTrigger(trigger: Trigger, t: BuilderT): string {
  const phrase = triggerMeta(trigger.event as WorkflowEvent, t).phrase;
  const filter = trigger.filter;
  if (!filter || Object.keys(filter).length === 0) return phrase;
  const parts = Object.entries(filter).map(([key, value]) =>
    t("preview.filterIs", { key, value: describeValue(value, t) }),
  );
  return t("preview.triggerWhere", { trigger: phrase, filters: joinAnd(parts, t) });
}

/** One-line summary of an action's config, e.g. "move to Phone screen". */
export function describeAction(action: Action, t: BuilderT): string {
  const meta = actionMeta(action.type, t);
  if (!meta) return action.type;
  const c = action.config as Record<string, unknown>;
  switch (action.type) {
    case "move_stage":
      return t("preview.moveTo", {
        stage: String(c.toStageName ?? c.toStageId ?? t("preview.stageFallback")),
      });
    case "set_status":
      return t("preview.setStatus", { status: String(c.status ?? "—") });
    case "add_note":
      return t("preview.addNote", { body: describeValue(c.body, t) });
    case "add_tag":
      return t("preview.addTag", { tag: describeValue(c.label, t) });
    case "remove_tag":
      return t("preview.removeTag", { tag: describeValue(c.label, t) });
    case "create_task": {
      const titled = Boolean(c.title);
      const assigned = Boolean(c.ownerId);
      if (titled && assigned) {
        return t("preview.createTaskTitledAssigned", { title: quote(String(c.title)) });
      }
      if (titled) return t("preview.createTaskTitled", { title: quote(String(c.title)) });
      if (assigned) return t("preview.createTaskAssigned");
      return t("preview.createTask");
    }
    case "send_slack":
      return t("preview.sendChatMessage", { message: describeValue(c.message, t) });
    case "send_email": {
      const subject = c.subject ? quote(String(c.subject)) : null;
      if (c.toEmail) {
        const recipient = quote(String(c.toEmail));
        return subject
          ? t("preview.emailRecipientSubject", { recipient, subject })
          : t("preview.emailRecipient", { recipient });
      }
      return subject
        ? t("preview.emailCandidateSubject", { subject })
        : t("preview.emailCandidate");
    }
    case "send_booking_link":
      return c.toEmail
        ? t("preview.bookingLinkRecipient", { recipient: quote(String(c.toEmail)) })
        : t("preview.bookingLinkCandidate");
    case "request_documents": {
      const items = Array.isArray(c.items) ? c.items.length : 0;
      return t("preview.requestDocuments", { count: items });
    }
    case "generate_document":
      return c.title
        ? t("preview.generateTitled", { title: quote(String(c.title)) })
        : t("preview.generateDefault");
    case "send_document_for_signature":
      return t("preview.sendForSignature", {
        document: c.documentRequestId ? t("preview.uploadedDocument") : t("preview.newDocument"),
      });
    case "erase_candidate_data":
      return t("preview.eraseCandidateData");
    case "http_request":
      return t("preview.httpRequest", {
        method: String(c.method ?? "POST"),
        url: c.url ? String(c.url) : t("preview.externalUrl"),
      });
    default:
      return meta.label.toLowerCase();
  }
}

function describeActions(actions: Action[], t: BuilderT): string {
  if (actions.length === 0) return t("preview.doNothing");
  return joinAnd(
    actions.map((action) => describeAction(action, t)),
    t,
  );
}

/** Full sentence: "When …, if …, then …." */
export function describeWorkflow(
  input: {
    trigger: Trigger;
    conditions?: ConditionNode[];
    actions: Action[];
  },
  t: BuilderT,
): string {
  const trigger = describeTrigger(input.trigger, t);
  const conditions = describeConditions(input.conditions, t);
  const actions = describeActions(input.actions, t);
  if (conditions === t("preview.always")) {
    return t("preview.workflowNoCondition", { trigger, actions });
  }
  return t("preview.workflow", { trigger, conditions, actions });
}

function graphTrigger(graph: WorkflowGraphV2): Trigger {
  const node = graph.nodes.find(
    (candidate): candidate is Extract<WorkflowNode, { type: "trigger" }> =>
      candidate.type === "trigger" && candidate.id === graph.entryNodeId,
  );
  return node ? { event: node.event, filter: node.filter } : { event: "application.created" };
}

/**
 * Honest summary for v2 list cards. It deliberately describes the graph's
 * shape instead of flattening it through the lossy legacy adapter.
 */
export function describeGraphWorkflow(graph: WorkflowGraphV2, t: BuilderT): string {
  const trigger = describeTrigger(graphTrigger(graph), t);
  const counts = graph.nodes.reduce(
    (result, node) => {
      result[node.type] += 1;
      return result;
    },
    { action: 0, condition: 0, delay: 0, approval: 0, wait: 0, end: 0, trigger: 0 },
  );
  const details = [
    counts.action > 0 ? t("preview.actionCount", { count: counts.action }) : null,
    counts.condition > 0 ? t("preview.branching") : null,
    counts.delay > 0 ? t("preview.delayStep") : null,
    counts.approval > 0 ? t("preview.approvalStep") : null,
    counts.wait > 0 ? t("preview.eventWaitStep") : null,
  ].filter((value): value is string => Boolean(value));
  const plan = details.length > 0 ? joinWith(details, (left, right) => t("preview.listComma", { left, right }), t) : t("preview.noConfiguredSteps");
  return t("preview.graphWorkflow", { trigger, plan });
}

export function graphActionCount(graph: WorkflowGraphV2): number {
  return graph.nodes.filter((node) => node.type === "action").length;
}
