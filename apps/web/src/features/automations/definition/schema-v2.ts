import { z } from "zod";

import {
  ACTION_TYPES,
  conditionsSchema,
  triggerFilterSchema,
  WORKFLOW_EVENTS,
  type ActionType,
  type Conditions,
  type Trigger,
} from "../schema";
import { GRAPH_SCHEMA_VERSION } from "./limits";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
) as z.ZodType<JsonValue>;

const nodeIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/, "Node ids must be alphanumeric.");

const bindingPathSchema = z
  .string()
  .min(1)
  .max(200)
  .refine((path) => isSafeBindingPath(path), "Binding path is not allowlisted.");

export function isSafeBindingPath(path: string): boolean {
  const segments = path.split(".");
  if (segments.length === 0 || segments.length > 12) return false;
  return segments.every((segment) => {
    if (!segment) return false;
    const lower = segment.toLowerCase();
    if (lower === "__proto__" || lower === "prototype" || lower === "constructor") {
      return false;
    }
    return /^[A-Za-z][A-Za-z0-9_]*$/.test(segment);
  });
}

export const bindingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("literal"), value: jsonValueSchema }),
  z.object({
    kind: z.literal("trigger"),
    path: bindingPathSchema,
    fallback: jsonValueSchema.optional(),
  }),
  z.object({
    kind: z.literal("output"),
    nodeId: nodeIdSchema,
    path: bindingPathSchema,
    fallback: jsonValueSchema.optional(),
  }),
]);

export type Binding = z.infer<typeof bindingSchema>;

const namedNode = {
  id: nodeIdSchema,
  name: z.string().trim().max(120).optional(),
  description: z.string().max(2000).optional(),
};

export const triggerNodeSchema = z.object({
  ...namedNode,
  type: z.literal("trigger"),
  event: z.enum(WORKFLOW_EVENTS),
  filter: triggerFilterSchema,
});

export const conditionGraphNodeSchema = z.object({
  ...namedNode,
  type: z.literal("condition"),
  tree: conditionsSchema,
});

export const actionNodeSchema = z.object({
  ...namedNode,
  type: z.literal("action"),
  actionType: z.enum(ACTION_TYPES),
  toolVersion: z.number().int().min(1).default(1),
  failurePolicy: z.enum(["stop", "route_error", "continue"]).default("stop"),
  input: z.record(z.string(), bindingSchema).default({}),
});

export const delayNodeSchema = z.object({
  ...namedNode,
  type: z.literal("delay"),
  mode: z.enum(["duration", "next_local"]).default("duration"),
  durationMs: z.number().int().min(0).max(30 * 24 * 60 * 60 * 1000).optional(),
  localTime: z.string().max(8).optional(),
  timeZone: z.string().max(80).optional(),
});

export const approvalNodeSchema = z.object({
  ...namedNode,
  type: z.literal("approval"),
  eligibleActorIds: z.array(z.string().min(1)).max(50).default([]),
  rule: z.enum(["any", "all"]).default("any"),
  deadlineHours: z.number().int().min(1).max(24 * 30).optional(),
});

export const waitNodeSchema = z.object({
  ...namedNode,
  type: z.literal("wait"),
  kind: z.enum(["event", "document_package"]),
  eventName: z.string().max(80).optional(),
  resourceId: bindingSchema.optional(),
  /** Explicit for new document waits; omitted means legacy auto-detection. */
  resourceType: z.enum(["package", "document"]).optional(),
  deadlineHours: z.number().int().min(1).max(24 * 90).optional(),
});

export const endNodeSchema = z.object({
  ...namedNode,
  type: z.literal("end"),
  result: z.enum(["completed", "stopped"]).default("completed"),
});

export const workflowNodeSchema = z.discriminatedUnion("type", [
  triggerNodeSchema,
  conditionGraphNodeSchema,
  actionNodeSchema,
  delayNodeSchema,
  approvalNodeSchema,
  waitNodeSchema,
  endNodeSchema,
]);

export type WorkflowNode = z.infer<typeof workflowNodeSchema>;

export const workflowEdgeSchema = z.object({
  id: z.string().min(1).max(80),
  source: nodeIdSchema,
  port: z.string().min(1).max(40),
  target: nodeIdSchema,
});

export type WorkflowEdge = z.infer<typeof workflowEdgeSchema>;

export const editorLayoutSchema = z.object({
  positions: z.record(z.string(), z.object({ x: z.number(), y: z.number() })).default({}),
  collapsedNodeIds: z.array(z.string()).default([]),
});

export type EditorLayout = z.infer<typeof editorLayoutSchema>;

export const workflowGraphV2Schema = z.object({
  schemaVersion: z.literal(GRAPH_SCHEMA_VERSION),
  entryNodeId: nodeIdSchema,
  nodes: z.array(workflowNodeSchema).max(100),
  edges: z.array(workflowEdgeSchema).max(200),
});

export type WorkflowGraphV2 = z.infer<typeof workflowGraphV2Schema>;

export const emptyLayout = (): EditorLayout => ({ positions: {}, collapsedNodeIds: [] });

export function emptyCanvasGraph(
  event: (typeof WORKFLOW_EVENTS)[number] = "application.created",
): WorkflowGraphV2 {
  return {
    schemaVersion: GRAPH_SCHEMA_VERSION,
    entryNodeId: "trigger",
    nodes: [{ id: "trigger", type: "trigger", event }],
    edges: [],
  };
}

export function parseGraph(input: unknown): WorkflowGraphV2 {
  return workflowGraphV2Schema.parse(input);
}

export type LegacyRecipe = {
  trigger: Trigger;
  conditions: Conditions;
  actions: Array<{ type: ActionType; config: Record<string, unknown>; continueOnError?: boolean }>;
};
