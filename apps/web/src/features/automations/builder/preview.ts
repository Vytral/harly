/**
 * Natural-language preview of a workflow draft. Pure, client-safe — takes the
 * builder's draft shape (same as `WorkflowDefinitionInput`) and renders a single
 * English sentence: "When X, if Y, then Z." Used in the builder's read-only
 * preview strip and as the subtitle on list cards.
 *
 * No secrets, no PII: config values are summarized, not dumped verbatim. Long
 * text (note/email bodies) is truncated to a preview.
 */

import type { Action, ConditionNode, FieldRef, Operator, Trigger, WorkflowEvent } from "../schema";
import { actionMeta, operatorMeta, triggerMeta } from "./catalog";

const BODY_PREVIEW = 60;

function quote(value: string): string {
  return value.length > BODY_PREVIEW ? `"${value.slice(0, BODY_PREVIEW).trim()}…"` : `"${value}"`;
}

function describeValue(value: unknown): string {
  if (value === null || value === undefined) return "nothing";
  if (typeof value === "string") return quote(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "nothing";
    const items = value.map((v) => (typeof v === "string" ? quote(v) : String(v)));
    return items.length === 1 ? items[0]! : `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`;
  }
  return String(value);
}

function describeField(field: FieldRef): string {
  if (field.kind === "literal") return describeValue(field.value);
  return `${field.kind}.${field.path}`;
}

function describeLeaf(
  leaf: Extract<ConditionNode, { type: "leaf" }>,
): string {
  const op = operatorMeta(leaf.op as Operator);
  const lhs = describeField(leaf.field);
  if (!op.wantsValue) {
    // is_set / is_empty read as "X is set" / "X is empty".
    return `${lhs} ${op.label}`;
  }
  return `${lhs} ${op.label} ${describeValue(leaf.value)}`;
}

function describeNode(node: ConditionNode): string {
  switch (node.type) {
    case "leaf":
      return describeLeaf(node);
    case "and":
      if (node.children.length === 0) return "always";
      return node.children.map((c, i) => {
        const text = describeNode(c);
        // Wrap sub-groups (and/or/not) in parens so precedence reads.
        return i > 0 && (c.type === "and" || c.type === "or") ? `(${text})` : text;
      }).join(" and ");
    case "or":
      if (node.children.length === 0) return "never";
      return node.children.map((c) => {
        const text = describeNode(c);
        return c.type === "and" ? `(${text})` : text;
      }).join(" or ");
    case "not":
      return `not ${describeNode(node.child)}`;
  }
}

/** Render a list of root condition nodes as "if …" text. Empty = "always". */
export function describeConditions(roots: ConditionNode[] | undefined): string {
  if (!roots || roots.length === 0) return "always";
  if (roots.length === 1) return describeNode(roots[0]!);
  // Multiple roots = implicit AND (conditionsSchema normalizes to array).
  return roots.map((r) => describeNode(r)).join(" and ");
}

/** "When <event>" with the filter, if any, appended. */
export function describeTrigger(trigger: Trigger): string {
  const meta = triggerMeta(trigger.event as WorkflowEvent);
  const lower = meta.label.toLowerCase();
  const article = /^[aeiou]/.test(lower) ? "an" : "a";
  const base = `${article} ${lower}`;
  const filter = trigger.filter;
  if (!filter || Object.keys(filter).length === 0) return base;
  const parts = Object.entries(filter).map(([k, v]) => `${k} is ${describeValue(v)}`);
  return `${base} where ${parts.join(" and ")}`;
}

/** One-line summary of an action's config, e.g. "move to Phone screen". */
export function describeAction(action: Action): string {
  const meta = actionMeta(action.type);
  if (!meta) return action.type;
  const c = action.config as Record<string, unknown>;
  switch (action.type) {
    case "move_stage":
      return `move to ${c.toStageName ?? c.toStageId ?? "a stage"}`;
    case "set_status":
      return `set status to ${c.status ?? "—"}`;
    case "add_note":
      return `add a note ${describeValue(c.body)}`;
    case "add_tag":
      return `add the ${describeValue(c.label)} tag`;
    case "remove_tag":
      return `remove the ${describeValue(c.label)} tag`;
    case "create_task":
      return `create a task${c.title ? ` ${quote(String(c.title))}` : ""}${c.ownerId ? " and assign it" : ""}`;
    case "send_slack":
      return `send a chat message ${describeValue(c.message)}`;
    case "send_email":
      return `email ${c.toEmail ? quote(String(c.toEmail)) : "the candidate"} ${c.subject ? `re: ${quote(String(c.subject))}` : ""}`;
    case "http_request":
      return `${c.method ?? "POST"} ${c.url ?? "an external URL"}`;
    default:
      return meta.label.toLowerCase();
  }
}

/** Full sentence: "When …, if …, then …." */
export function describeWorkflow(input: {
  trigger: Trigger;
  conditions?: ConditionNode[];
  actions: Action[];
}): string {
  const when = describeTrigger(input.trigger);
  const cond = describeConditions(input.conditions);
  const thenPart = input.actions.length === 0
    ? "do nothing"
    : input.actions.length === 1
      ? describeAction(input.actions[0]!)
      : `${input.actions.slice(0, -1).map(describeAction).join(", ")} and ${describeAction(input.actions.at(-1)!)}`;

  const ifClause = cond === "always" ? "" : ` if ${cond},`;
  return `When ${when},${ifClause} then ${thenPart}.`;
}
