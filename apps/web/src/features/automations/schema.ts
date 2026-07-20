import { z } from "zod";

/**
 * Zod schemas for the workflow engine — the single source of truth for the
 * shape of a workflow, shared by the builder UI, the REST API, the AI tool, and
 * the engine. JSONB in `workflow_definitions` is validated against these before
 * it is ever persisted or executed (never trust raw client JSONB).
 *
 * Structure: WHEN (trigger) → IF (condition tree) → DO (ordered actions).
 * See WORKFLOW_ENGINE_DESIGN.md §2.4 / §2.5.
 */

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

/**
 * The subset of `WebhookEvent` that can start a workflow. Defined as a literal
 * union here (and re-exported from events.ts) so this module stays client-safe
 * and does not import server-only code. The server layer asserts membership at
 * dispatch time.
 *
 * Kept in sync with `WEBHOOK_EVENTS` in server/webhooks/events.ts.
 */
export const WORKFLOW_EVENTS = [
  "application.created",
  "application.stage_changed",
  "application.hired",
  "application.rejected",
  "candidate.created",
  "candidate.updated",
  "interview.scheduled",
  "interview.completed",
  "job.published",
] as const;

export type WorkflowEvent = (typeof WORKFLOW_EVENTS)[number];

export function isWorkflowEvent(value: string): value is WorkflowEvent {
  return (WORKFLOW_EVENTS as readonly string[]).includes(value);
}

/**
 * A trigger filter narrows which emissions fire the workflow, evaluated cheaply
 * against the event payload BEFORE a run row is created (§2.3). All provided
 * fields must be equal (AND semantics). Omitted fields match anything.
 *
 * Values are primitives or arrays of primitives; arrays use `in` membership.
 */
const triggerFilterSchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())]))
  .optional();

export const triggerSchema = z.object({
  event: z.enum(WORKFLOW_EVENTS),
  filter: triggerFilterSchema,
});

export type Trigger = z.infer<typeof triggerSchema>;

// ---------------------------------------------------------------------------
// Conditions — a serializable AND/OR/NOT tree over domain fields
// ---------------------------------------------------------------------------

/** Operators the condition evaluator supports (§2.4). */
export const OPERATORS = [
  "eq",
  "ne",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "not_in",
  "includes",
  "starts_with",
  "ends_with",
  "contains",
  "is_set",
  "is_empty",
  "match_any",
  "regex",
] as const;

export type Operator = (typeof OPERATORS)[number];

/**
 * A field reference — what the left-hand side of a leaf condition reads. The
 * `kind` picks the context object; `path` is the property within it. `literal`
 * is a constant (useful for `branch` comparisons and AI templates).
 */
export const fieldRefSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("candidate"),
    path: z.string().min(1).max(80),
  }),
  z.object({
    kind: z.literal("application"),
    path: z.string().min(1).max(80),
  }),
  z.object({
    kind: z.literal("job"),
    path: z.string().min(1).max(80),
  }),
  z.object({
    kind: z.literal("ai"),
    path: z.string().min(1).max(80),
  }),
  z.object({
    kind: z.literal("trigger"),
    path: z.string().min(1).max(80),
  }),
  z.object({
    kind: z.literal("literal"),
    value: z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.null(),
      z.array(z.union([z.string(), z.number(), z.boolean()])),
    ]),
  }),
]);

export type FieldRef = z.infer<typeof fieldRefSchema>;

/** A JSON value usable on the right-hand side of a leaf condition. */
const conditionValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string(), z.number(), z.boolean()])),
]);

/**
 * Recursive condition tree. `leaf` compares a field to a value; `and`/`or`
 * combine children; `not` negates one child. An empty `and` = true, an empty
 * `or` = false (standard boolean identity).
 */
export const conditionSchema: z.ZodType<ConditionNode> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("leaf"),
      field: fieldRefSchema,
      op: z.enum(OPERATORS),
      value: conditionValueSchema,
    }),
    z.object({
      type: z.literal("and"),
      children: z.array(conditionSchema).max(50),
    }),
    z.object({
      type: z.literal("or"),
      children: z.array(conditionSchema).max(50),
    }),
    z.object({
      type: z.literal("not"),
      child: conditionSchema,
    }),
  ]),
);

export type LeafCondition = {
  type: "leaf";
  field: FieldRef;
  op: Operator;
  value: string | number | boolean | null | Array<string | number | boolean>;
};
export type ConditionNode =
  | LeafCondition
  | { type: "and"; children: ConditionNode[] }
  | { type: "or"; children: ConditionNode[] }
  | { type: "not"; child: ConditionNode };

/**
 * The stored `conditions` column is either a single root node or an implicit
 * AND of several roots (the builder's default grouping). An empty array means
 * "always match" — no conditions to evaluate.
 */
export const conditionsSchema = z
  .union([conditionSchema, z.array(conditionSchema).max(50)])
  .optional()
  .transform((value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]));

/** Normalized form: always an array of root nodes (empty = always match). */
export type Conditions = z.infer<typeof conditionsSchema>;

// ---------------------------------------------------------------------------
// Actions — an ordered list of typed descriptors
// ---------------------------------------------------------------------------

/**
 * Action type identifiers. The registry (registry.ts) maps each of these to a
 * handler. v1 ships a subset; the catalog is append-only.
 */
export const ACTION_TYPES = [
  // Pipeline
  "move_stage",
  "set_status",
  // Candidate
  "add_note",
  "add_tag",
  "remove_tag",
  // Communication
  "send_email",
  "send_slack",
  "send_telegram",
  "send_discord",
  // Interview / offer / task
  "schedule_interview",
  "create_offer",
  "send_offer",
  "create_task",
  // External
  "http_request",
  // AI
  "ai_score",
  "ai_summarize",
  "ai_decide",
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

export function isActionType(value: string): value is ActionType {
  return (ACTION_TYPES as readonly string[]).includes(value);
}

/**
 * A single action descriptor: a type + its config. The per-type config schema
 * is enforced by the registry at execution time; at the persistence layer we
 * only validate that `config` is an object (the registry owns the detail).
 *
 * `continueOnError` lets a non-critical action (e.g. a Slack ping) not abort
 * the whole run when it fails (§2.5).
 */
export const actionSchema = z.object({
  type: z.enum(ACTION_TYPES),
  config: z.record(z.string(), z.unknown()),
  continueOnError: z.boolean().optional().default(false),
});

export type Action = z.infer<typeof actionSchema>;

/** v1 cap on actions per workflow (decision D8). */
export const MAX_ACTIONS_PER_WORKFLOW = 10;

export const actionsSchema = z
  .array(actionSchema)
  .min(1, "A workflow must have at least one action.")
  .max(MAX_ACTIONS_PER_WORKFLOW, `A workflow can have at most ${MAX_ACTIONS_PER_WORKFLOW} actions.`);

// ---------------------------------------------------------------------------
// The whole workflow definition
// ---------------------------------------------------------------------------

export const workflowDefinitionSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).optional(),
  enabled: z.boolean().optional().default(true),
  trigger: triggerSchema,
  conditions: conditionsSchema.optional(),
  actions: actionsSchema,
  createdById: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

/** Shape used by create/update server actions (no server-generated fields). */
export const workflowInputSchema = workflowDefinitionSchema
  .pick({
    name: true,
    description: true,
    enabled: true,
    trigger: true,
    conditions: true,
    actions: true,
  })
  .extend({
    // `conditions` is optional on input; normalize to [] when absent.
    conditions: conditionsSchema.optional(),
  });

export type WorkflowDefinitionInput = z.infer<typeof workflowInputSchema>;
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;

/**
 * Assert that a `trigger.event` matches a given string. Used by the data layer
 * to keep the denormalized `triggerEvent` column in sync with the jsonb.
 */
export function triggerEventOf(trigger: Trigger): WorkflowEvent {
  return trigger.event;
}
