import { z } from "zod";

import {
  ACTION_TYPES,
  conditionsSchema,
  triggerFilterSchema,
  WORKFLOW_EVENTS,
} from "../schema";
import {
  bindingSchema,
  jsonValueSchema,
  workflowNodeSchema,
  workflowEdgeSchema,
  type EditorLayout,
  type WorkflowEdge,
  type WorkflowGraphV2,
  type WorkflowNode,
} from "./schema-v2";

// ============================================================================
// 1. Plan Definition (AutomationPlanV1)
// ============================================================================

export const planStepSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[A-Za-z][A-Za-z0-9_-]*$/, "Step id must be alphanumeric."),
    name: z.string().trim().max(120).optional(),
    description: z.string().max(2000).optional(),
    actionType: z.enum(ACTION_TYPES),
    toolVersion: z.number().int().min(1).default(1),
    failurePolicy: z.enum(["stop", "route_error", "continue"]).default("stop"),
    // AI models naturally emit `input: { status: "rejected" }`. Accept that
    // safe JSON shorthand and normalize it to the canonical binding form below;
    // explicit trigger/output bindings remain fully supported and validated.
    input: z
      .record(z.string(), z.union([bindingSchema, jsonValueSchema]))
      .default({}),
  })
  .transform((step) => ({
    ...step,
    input: Object.fromEntries(
      Object.entries(step.input).map(([name, value]) => {
        const binding = bindingSchema.safeParse(value);
        return [
          name,
          binding.success ? binding.data : { kind: "literal" as const, value },
        ];
      }),
    ),
  }));

export type PlanStep = z.infer<typeof planStepSchema>;

export const planBranchSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[A-Za-z][A-Za-z0-9_-]*$/, "Branch id must be alphanumeric."),
  name: z.string().trim().max(120).optional(),
  conditions: conditionsSchema,
  trueSteps: z.array(planStepSchema).default([]),
  falseSteps: z.array(planStepSchema).default([]),
});

export type PlanBranch = z.infer<typeof planBranchSchema>;

export const planDelaySchema = z.object({
  id: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[A-Za-z][A-Za-z0-9_-]*$/, "Delay id must be alphanumeric."),
  name: z.string().trim().max(120).optional(),
  mode: z.enum(["duration", "next_local"]).default("duration"),
  durationMs: z
    .number()
    .int()
    .min(0)
    .max(30 * 24 * 60 * 60 * 1000)
    .optional(),
  localTime: z.string().max(8).optional(),
  timeZone: z.string().max(80).optional(),
});

export type PlanDelay = z.infer<typeof planDelaySchema>;

export const planApprovalSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[A-Za-z][A-Za-z0-9_-]*$/, "Approval id must be alphanumeric."),
  name: z.string().trim().max(120).optional(),
  eligibleActorIds: z.array(z.string().min(1)).max(50).default([]),
  rule: z.enum(["any", "all"]).default("any"),
  deadlineHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .optional(),
  approvedSteps: z.array(planStepSchema).default([]),
  rejectedSteps: z.array(planStepSchema).default([]),
  expiredSteps: z.array(planStepSchema).default([]),
});

export type PlanApproval = z.infer<typeof planApprovalSchema>;

export const planWaitSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[A-Za-z][A-Za-z0-9_-]*$/, "Wait id must be alphanumeric."),
  name: z.string().trim().max(120).optional(),
  kind: z.enum(["event", "document_package"]),
  eventName: z.string().max(80).optional(),
  resourceId: bindingSchema.optional(),
  resourceType: z.enum(["package", "document"]).optional(),
  deadlineHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 90)
    .optional(),
  matchedSteps: z.array(planStepSchema).default([]),
  expiredSteps: z.array(planStepSchema).default([]),
  completedSteps: z.array(planStepSchema).optional(),
  declinedSteps: z.array(planStepSchema).optional(),
  cancelledSteps: z.array(planStepSchema).optional(),
});

export type PlanWait = z.infer<typeof planWaitSchema>;

/**
 * Control-plane limits are deliberately kept outside WorkflowGraphV2. They
 * affect dispatch safety, not graph semantics, and must therefore be persisted
 * and reviewed independently from node edits.
 */
export const operationalPolicyPatchSchema = z
  .object({
    maxRunsPerMinute: z.number().int().min(1).max(10_000).optional(),
    maxExternalActionsPerMinute: z
      .number()
      .int()
      .min(1)
      .max(10_000)
      .optional(),
    circuitBreakerThreshold: z.number().int().min(1).max(100).optional(),
    circuitBreakerCooldownSeconds: z
      .number()
      .int()
      .min(30)
      .max(86_400)
      .optional(),
    circuitOpenUntil: z.string().datetime().nullable().optional(),
  })
  .refine(
    (policy) => Object.values(policy).some((value) => value !== undefined),
    "setOperationalPolicy must change at least one policy field.",
  );

export type OperationalPolicyPatch = z.infer<
  typeof operationalPolicyPatchSchema
>;

/**
 * A composable plan sequence. The original V1 fields (`steps`, `branches`,
 * `delays`, `approvals`, and `waits`) remain supported for compatibility, but
 * they impose a fixed phase ordering. `flow` lets Harly express an arbitrary
 * supported workflow in business order while the compiler still owns node
 * IDs, ports, edges, and layout.
 */
export type AutomationFlowItem =
  | { kind: "action"; step: PlanStep }
  | {
      kind: "branch";
      id: string;
      name?: string;
      conditions: z.infer<typeof conditionsSchema>;
      trueFlow?: AutomationFlowItem[];
      falseFlow?: AutomationFlowItem[];
    }
  | ({ kind: "delay" } & PlanDelay)
  | {
      kind: "approval";
      id: string;
      name?: string;
      eligibleActorIds: string[];
      rule: "any" | "all";
      deadlineHours?: number;
      approvedFlow?: AutomationFlowItem[];
      rejectedFlow?: AutomationFlowItem[];
      expiredFlow?: AutomationFlowItem[];
    }
  | {
      kind: "wait";
      id: string;
      name?: string;
      waitKind: "event" | "document_package";
      eventName?: string;
      resourceId?: z.infer<typeof bindingSchema>;
      resourceType?: "package" | "document";
      deadlineHours?: number;
      matchedFlow?: AutomationFlowItem[];
      expiredFlow?: AutomationFlowItem[];
      completedFlow?: AutomationFlowItem[];
      declinedFlow?: AutomationFlowItem[];
      cancelledFlow?: AutomationFlowItem[];
    };

const automationFlowSchema: z.ZodType<AutomationFlowItem[]> = z.lazy(() =>
  z.array(automationFlowItemSchema).max(500),
);

const automationFlowItemSchema: z.ZodType<AutomationFlowItem> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("action"),
      step: planStepSchema,
    }),
    z.object({
      kind: z.literal("branch"),
      id: planBranchSchema.shape.id,
      name: planBranchSchema.shape.name,
      conditions: conditionsSchema,
      trueFlow: automationFlowSchema.default([]),
      falseFlow: automationFlowSchema.default([]),
    }),
    planDelaySchema.extend({ kind: z.literal("delay") }),
    z.object({
      kind: z.literal("approval"),
      id: planApprovalSchema.shape.id,
      name: planApprovalSchema.shape.name,
      eligibleActorIds: planApprovalSchema.shape.eligibleActorIds,
      rule: planApprovalSchema.shape.rule,
      deadlineHours: planApprovalSchema.shape.deadlineHours,
      approvedFlow: automationFlowSchema.default([]),
      rejectedFlow: automationFlowSchema.default([]),
      expiredFlow: automationFlowSchema.default([]),
    }),
    z.object({
      kind: z.literal("wait"),
      id: planWaitSchema.shape.id,
      name: planWaitSchema.shape.name,
      waitKind: planWaitSchema.shape.kind,
      eventName: planWaitSchema.shape.eventName,
      resourceId: planWaitSchema.shape.resourceId,
      resourceType: planWaitSchema.shape.resourceType,
      deadlineHours: planWaitSchema.shape.deadlineHours,
      matchedFlow: automationFlowSchema.default([]),
      expiredFlow: automationFlowSchema.default([]),
      completedFlow: automationFlowSchema.default([]),
      declinedFlow: automationFlowSchema.default([]),
      cancelledFlow: automationFlowSchema.default([]),
    }),
  ]),
);

export const automationPlanV1Schema = z.object({
  version: z.literal(1),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).optional(),
  trigger: z.object({
    event: z.enum(WORKFLOW_EVENTS),
    filter: triggerFilterSchema,
  }),
  steps: z.array(planStepSchema).default([]),
  branches: z.array(planBranchSchema).default([]),
  delays: z.array(planDelaySchema).default([]),
  approvals: z.array(planApprovalSchema).default([]),
  waits: z.array(planWaitSchema).default([]),
  flow: automationFlowSchema.optional(),
  operationalPolicy: operationalPolicyPatchSchema.optional(),
});

export type AutomationPlanV1 = z.infer<typeof automationPlanV1Schema>;

// ============================================================================
// 2. Patch Definition (AutomationPatchV1)
// ============================================================================

export const patchOperationSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("addNode"),
    node: workflowNodeSchema,
  }),
  z.object({
    op: z.literal("removeNode"),
    nodeId: z.string().min(1),
  }),
  z.object({
    op: z.literal("configureNode"),
    nodeId: z.string().min(1),
    patch: z.record(z.string(), z.unknown()),
  }),
  z.object({
    op: z.literal("connect"),
    source: z.string().min(1),
    port: z.string().min(1),
    target: z.string().min(1),
  }),
  z.object({
    op: z.literal("disconnect"),
    edgeId: z.string().optional(),
    source: z.string().optional(),
    port: z.string().optional(),
    target: z.string().optional(),
  }),
  z.object({
    op: z.literal("replaceSubgraph"),
    removeNodeIds: z.array(z.string().min(1)),
    addNodes: z.array(workflowNodeSchema),
    addEdges: z.array(workflowEdgeSchema),
  }),
  z.object({
    op: z.literal("renameWorkflow"),
    name: z.string().trim().min(1).max(120),
  }),
  z.object({
    op: z.literal("setDescription"),
    description: z.string().max(2000).nullable(),
  }),
  z.object({
    op: z.literal("setOperationalPolicy"),
    policy: operationalPolicyPatchSchema,
  }),
  z.object({
    op: z.literal("autoLayoutSubset"),
    nodeIds: z.array(z.string().min(1)).min(1).max(100),
    direction: z.enum(["vertical", "horizontal"]).default("vertical"),
    origin: z
      .object({ x: z.number().finite(), y: z.number().finite() })
      .optional(),
    gap: z.number().finite().min(40).max(1000).default(140),
  }),
]);

export type PatchOperation = z.infer<typeof patchOperationSchema>;

export const automationPatchV1Schema = z.object({
  version: z.literal(1),
  baseRevision: z.number().int().positive().optional(),
  baseContentHash: z.string().length(64).optional(),
  /** Alias of baseContentHash kept for older prompts/docs; normalized on entry. */
  baseGraphHash: z.string().length(64).optional(),
  /** Formal subgraph rebase anchors. A mismatch is a conflict, never a guess. */
  baseSubgraphHash: z.string().length(64).optional(),
  baseNodeIds: z.array(z.string().min(1).max(80)).max(200).optional(),
  operations: z.array(patchOperationSchema).min(1),
}).refine(
  (patch) => patch.baseContentHash === undefined || patch.baseGraphHash === undefined || patch.baseContentHash === patch.baseGraphHash,
  { message: "baseContentHash and baseGraphHash disagree; send one base hash." },
);

export type AutomationPatchV1 = z.infer<typeof automationPatchV1Schema>;

// ============================================================================
// 3. Plan Compiler (AutomationPlanV1 -> WorkflowGraphV2 + Layout)
// ============================================================================

export function compilePlanToGraph(plan: AutomationPlanV1): {
  graph: WorkflowGraphV2;
  layout: EditorLayout;
  operationalPolicy?: OperationalPolicyPatch;
} {
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];
  const positions: EditorLayout["positions"] = {};
  const nodeIds = new Set<string>();

  let edgeCounter = 1;
  const nextEdgeId = () => `e_${edgeCounter++}`;

  type Terminal = { source: string; port: string };
  let currentY = 180;

  function addNode(node: WorkflowNode, x: number, y: number): void {
    if (nodeIds.has(node.id)) {
      throw new Error(`Plan contains duplicate node id "${node.id}".`);
    }
    nodeIds.add(node.id);
    nodes.push(node);
    positions[node.id] = { x, y };
  }

  function connectFrom(terminals: readonly Terminal[], target: string): void {
    for (const terminal of terminals) {
      edges.push({
        id: nextEdgeId(),
        source: terminal.source,
        port: terminal.port,
        target,
      });
    }
  }

  function actionNode(step: PlanStep): WorkflowNode {
    return {
      id: step.id,
      name: step.name,
      description: step.description,
      type: "action",
      actionType: step.actionType,
      toolVersion: step.toolVersion,
      failurePolicy: step.failurePolicy,
      input: step.input,
    };
  }

  function appendActions(
    steps: readonly PlanStep[],
    input: readonly Terminal[],
    x: number,
    startY: number,
  ): { terminals: Terminal[]; endY: number } {
    let terminals = [...input];
    let y = startY;
    for (const step of steps) {
      addNode(actionNode(step), x, y);
      const node = nodes[nodes.length - 1]!;
      connectFrom(terminals, node.id);
      terminals = [{ source: node.id, port: "success" }];
      if (step.failurePolicy === "route_error") {
        terminals.push({ source: node.id, port: "error" });
      }
      y += 130;
    }
    return { terminals, endY: y };
  }

  function appendRoutedActions(
    steps: readonly PlanStep[],
    source: Terminal,
    x: number,
    y: number,
  ): { terminals: Terminal[]; endY: number } {
    return appendActions(steps, [source], x, y);
  }

  function appendDelay(
    delay: PlanDelay,
    input: readonly Terminal[],
    y: number,
  ): Terminal[] {
    addNode(
      {
        id: delay.id,
        name: delay.name,
        type: "delay",
        mode: delay.mode,
        durationMs: delay.durationMs,
        localTime: delay.localTime,
        timeZone: delay.timeZone,
      },
      250,
      y,
    );
    connectFrom(input, delay.id);
    return [{ source: delay.id, port: "elapsed" }];
  }

  function appendBranch(
    branch: PlanBranch,
    input: readonly Terminal[],
    y: number,
  ): { terminals: Terminal[]; endY: number } {
    addNode(
      {
        id: branch.id,
        name: branch.name,
        type: "condition",
        tree: branch.conditions,
      },
      250,
      y,
    );
    connectFrom(input, branch.id);
    const branchY = y + 140;
    const trueResult = appendRoutedActions(
      branch.trueSteps,
      { source: branch.id, port: "true" },
      100,
      branchY,
    );
    const falseResult = appendRoutedActions(
      branch.falseSteps,
      { source: branch.id, port: "false" },
      400,
      branchY,
    );
    return {
      terminals: [...trueResult.terminals, ...falseResult.terminals],
      endY: Math.max(trueResult.endY, falseResult.endY) + 40,
    };
  }

  function appendApproval(
    approval: PlanApproval,
    input: readonly Terminal[],
    y: number,
  ): { terminals: Terminal[]; endY: number } {
    addNode(
      {
        id: approval.id,
        name: approval.name,
        type: "approval",
        eligibleActorIds: approval.eligibleActorIds,
        rule: approval.rule,
        deadlineHours: approval.deadlineHours,
      },
      250,
      y,
    );
    connectFrom(input, approval.id);
    const branchY = y + 140;
    const approved = appendRoutedActions(
      approval.approvedSteps,
      { source: approval.id, port: "approved" },
      100,
      branchY,
    );
    const rejected = appendRoutedActions(
      approval.rejectedSteps,
      { source: approval.id, port: "rejected" },
      400,
      branchY,
    );
    const expired = appendRoutedActions(
      approval.expiredSteps,
      { source: approval.id, port: "expired" },
      250,
      branchY + 80,
    );
    return {
      terminals: [
        ...approved.terminals,
        ...rejected.terminals,
        ...expired.terminals,
      ],
      endY: Math.max(approved.endY, rejected.endY, expired.endY) + 40,
    };
  }

  function appendWait(
    wait: PlanWait,
    input: readonly Terminal[],
    y: number,
  ): { terminals: Terminal[]; endY: number } {
    addNode(
      {
        id: wait.id,
        name: wait.name,
        type: "wait",
        kind: wait.kind,
        eventName: wait.eventName,
        resourceId: wait.resourceId,
        resourceType: wait.resourceType,
        deadlineHours: wait.deadlineHours,
      },
      250,
      y,
    );
    connectFrom(input, wait.id);
    const branchY = y + 140;
    if (wait.kind === "document_package") {
      const completed = appendRoutedActions(
        wait.completedSteps ?? wait.matchedSteps,
        { source: wait.id, port: "completed" },
        80,
        branchY,
      );
      const declined = appendRoutedActions(
        wait.declinedSteps ?? wait.expiredSteps,
        { source: wait.id, port: "declined" },
        220,
        branchY,
      );
      const cancelled = appendRoutedActions(
        wait.cancelledSteps ?? wait.expiredSteps,
        { source: wait.id, port: "cancelled" },
        380,
        branchY,
      );
      const expired = appendRoutedActions(
        wait.expiredSteps,
        { source: wait.id, port: "expired" },
        540,
        branchY,
      );
      return {
        terminals: [
          ...completed.terminals,
          ...declined.terminals,
          ...cancelled.terminals,
          ...expired.terminals,
        ],
        endY:
          Math.max(
            completed.endY,
            declined.endY,
            cancelled.endY,
            expired.endY,
          ) + 40,
      };
    }
    const matched = appendRoutedActions(
      wait.matchedSteps,
      { source: wait.id, port: "matched" },
      100,
      branchY,
    );
    const expired = appendRoutedActions(
      wait.expiredSteps,
      { source: wait.id, port: "expired" },
      400,
      branchY,
    );
    return {
      terminals: [...matched.terminals, ...expired.terminals],
      endY: Math.max(matched.endY, expired.endY) + 40,
    };
  }

  function appendFlow(
    flow: readonly AutomationFlowItem[],
    input: readonly Terminal[],
    startY: number,
    x: number,
  ): { terminals: Terminal[]; endY: number } {
    let terminals = [...input];
    let y = startY;

    for (const item of flow) {
      switch (item.kind) {
        case "action": {
          addNode(actionNode(item.step), x, y);
          const node = nodes[nodes.length - 1]!;
          connectFrom(terminals, node.id);
          terminals = [{ source: node.id, port: "success" }];
          if (item.step.failurePolicy === "route_error") {
            terminals.push({ source: node.id, port: "error" });
          }
          y += 130;
          break;
        }
        case "delay": {
          addNode(
            {
              id: item.id,
              name: item.name,
              type: "delay",
              mode: item.mode,
              durationMs: item.durationMs,
              localTime: item.localTime,
              timeZone: item.timeZone,
            },
            x,
            y,
          );
          connectFrom(terminals, item.id);
          terminals = [{ source: item.id, port: "elapsed" }];
          y += 130;
          break;
        }
        case "branch": {
          addNode(
            {
              id: item.id,
              name: item.name,
              type: "condition",
              tree: item.conditions,
            },
            x,
            y,
          );
          connectFrom(terminals, item.id);
          const branchY = y + 140;
          const trueResult = appendFlow(
            item.trueFlow ?? [],
            [{ source: item.id, port: "true" }],
            branchY,
            x - 160,
          );
          const falseResult = appendFlow(
            item.falseFlow ?? [],
            [{ source: item.id, port: "false" }],
            branchY,
            x + 160,
          );
          terminals = [...trueResult.terminals, ...falseResult.terminals];
          y = Math.max(trueResult.endY, falseResult.endY) + 40;
          break;
        }
        case "approval": {
          addNode(
            {
              id: item.id,
              name: item.name,
              type: "approval",
              eligibleActorIds: item.eligibleActorIds,
              rule: item.rule,
              deadlineHours: item.deadlineHours,
            },
            x,
            y,
          );
          connectFrom(terminals, item.id);
          const approvalY = y + 140;
          const approved = appendFlow(
            item.approvedFlow ?? [],
            [{ source: item.id, port: "approved" }],
            approvalY,
            x - 160,
          );
          const rejected = appendFlow(
            item.rejectedFlow ?? [],
            [{ source: item.id, port: "rejected" }],
            approvalY,
            x,
          );
          const expired = appendFlow(
            item.expiredFlow ?? [],
            [{ source: item.id, port: "expired" }],
            approvalY,
            x + 160,
          );
          terminals = [
            ...approved.terminals,
            ...rejected.terminals,
            ...expired.terminals,
          ];
          y = Math.max(approved.endY, rejected.endY, expired.endY) + 40;
          break;
        }
        case "wait": {
          addNode(
            {
              id: item.id,
              name: item.name,
              type: "wait",
              kind: item.waitKind,
              eventName: item.eventName,
              resourceId: item.resourceId,
              resourceType: item.resourceType,
              deadlineHours: item.deadlineHours,
            },
            x,
            y,
          );
          connectFrom(terminals, item.id);
          const waitY = y + 140;
          if (item.waitKind === "document_package") {
            const completed = appendFlow(
              item.completedFlow ?? [],
              [{ source: item.id, port: "completed" }],
              waitY,
              x - 240,
            );
            const declined = appendFlow(
              item.declinedFlow ?? [],
              [{ source: item.id, port: "declined" }],
              waitY,
              x - 80,
            );
            const cancelled = appendFlow(
              item.cancelledFlow ?? [],
              [{ source: item.id, port: "cancelled" }],
              waitY,
              x + 80,
            );
            const expired = appendFlow(
              item.expiredFlow ?? [],
              [{ source: item.id, port: "expired" }],
              waitY,
              x + 240,
            );
            terminals = [
              ...completed.terminals,
              ...declined.terminals,
              ...cancelled.terminals,
              ...expired.terminals,
            ];
            y =
              Math.max(
                completed.endY,
                declined.endY,
                cancelled.endY,
                expired.endY,
              ) + 40;
          } else {
            const matched = appendFlow(
              item.matchedFlow ?? [],
              [{ source: item.id, port: "matched" }],
              waitY,
              x - 80,
            );
            const expired = appendFlow(
              item.expiredFlow ?? [],
              [{ source: item.id, port: "expired" }],
              waitY,
              x + 80,
            );
            terminals = [...matched.terminals, ...expired.terminals];
            y = Math.max(matched.endY, expired.endY) + 40;
          }
          break;
        }
      }
    }

    return { terminals, endY: y };
  }

  const triggerNodeId = "trigger";
  addNode(
    {
      id: triggerNodeId,
      type: "trigger",
      event: plan.trigger.event,
      filter: plan.trigger.filter,
    },
    250,
    50,
  );

  let terminals: Terminal[] = [{ source: triggerNodeId, port: "next" }];

  if (plan.flow) {
    const flow = appendFlow(plan.flow, terminals, currentY, 250);
    terminals = flow.terminals;
    currentY = flow.endY;
  } else {
    for (const delay of plan.delays) {
      terminals = appendDelay(delay, terminals, currentY);
      currentY += 130;
    }

    const linear = appendActions(plan.steps, terminals, 250, currentY);
    terminals = linear.terminals;
    currentY = linear.endY;

    for (const branch of plan.branches) {
      const result = appendBranch(branch, terminals, currentY);
      terminals = result.terminals;
      currentY = result.endY;
    }

    for (const approval of plan.approvals) {
      const result = appendApproval(approval, terminals, currentY);
      terminals = result.terminals;
      currentY = result.endY;
    }

    for (const wait of plan.waits) {
      const result = appendWait(wait, terminals, currentY);
      terminals = result.terminals;
      currentY = result.endY;
    }
  }

  const endNodeId = "end";
  addNode({ id: endNodeId, type: "end", result: "completed" }, 250, currentY);
  connectFrom(terminals, endNodeId);

  return {
    graph: {
      schemaVersion: 2,
      entryNodeId: triggerNodeId,
      nodes,
      edges,
    },
    layout: {
      positions,
      collapsedNodeIds: [],
    },
    operationalPolicy: plan.operationalPolicy,
  };
}

// ============================================================================
// 4. Patch Applier (WorkflowGraphV2 + AutomationPatchV1 -> WorkflowGraphV2 + Layout)
// ============================================================================

export function applyPatchToGraph(input: {
  graph: WorkflowGraphV2;
  layout?: EditorLayout;
  patch: AutomationPatchV1;
  name?: string;
  description?: string | null;
}): {
  graph: WorkflowGraphV2;
  layout: EditorLayout;
  name?: string;
  description?: string | null;
  operationalPolicy?: OperationalPolicyPatch;
} {
  let nodes = [...input.graph.nodes];
  let edges = [...input.graph.edges];
  const positions = { ...(input.layout?.positions ?? {}) };
  const collapsedNodeIds = [...(input.layout?.collapsedNodeIds ?? [])];
  let currentName = input.name;
  let currentDescription = input.description;
  let operationalPolicy: OperationalPolicyPatch | undefined;

  let edgeCounter = edges.length + 1;
  const nextEdgeId = () => `pe_${edgeCounter++}`;

  for (const op of input.patch.operations) {
    switch (op.op) {
      case "addNode": {
        if (nodes.some((n) => n.id === op.node.id)) {
          throw new Error(
            `Node with id "${op.node.id}" already exists in the graph.`,
          );
        }
        nodes.push(op.node);
        if (!positions[op.node.id]) {
          // Default layout coordinate
          const maxY = Object.values(positions).reduce(
            (max, p) => Math.max(max, p.y),
            0,
          );
          positions[op.node.id] = { x: 250, y: maxY + 120 };
        }
        break;
      }

      case "removeNode": {
        if (op.nodeId === input.graph.entryNodeId) {
          throw new Error(
            "Cannot remove the trigger / entry node of the graph.",
          );
        }
        nodes = nodes.filter((n) => n.id !== op.nodeId);
        edges = edges.filter(
          (e) => e.source !== op.nodeId && e.target !== op.nodeId,
        );
        delete positions[op.nodeId];
        break;
      }

      case "configureNode": {
        const nodeIndex = nodes.findIndex((n) => n.id === op.nodeId);
        if (nodeIndex === -1) {
          throw new Error(`Node "${op.nodeId}" not found for configuration.`);
        }
        const existingNode = nodes[nodeIndex]!;
        nodes[nodeIndex] = {
          ...existingNode,
          ...op.patch,
          id: existingNode.id, // ID cannot be changed via configureNode
          type: existingNode.type, // Node type cannot be changed
        } as WorkflowNode;
        break;
      }

      case "connect": {
        const sourceExists = nodes.some((n) => n.id === op.source);
        const targetExists = nodes.some((n) => n.id === op.target);
        if (!sourceExists)
          throw new Error(`Connect source node "${op.source}" does not exist.`);
        if (!targetExists)
          throw new Error(`Connect target node "${op.target}" does not exist.`);

        const duplicate = edges.some(
          (e) =>
            e.source === op.source &&
            e.port === op.port &&
            e.target === op.target,
        );
        if (!duplicate) {
          edges.push({
            id: nextEdgeId(),
            source: op.source,
            port: op.port,
            target: op.target,
          });
        }
        break;
      }

      case "disconnect": {
        if (op.edgeId) {
          edges = edges.filter((e) => e.id !== op.edgeId);
        } else if (op.source || op.port || op.target) {
          edges = edges.filter((e) => {
            if (op.source && e.source !== op.source) return true;
            if (op.port && e.port !== op.port) return true;
            if (op.target && e.target !== op.target) return true;
            return false;
          });
        }
        break;
      }

      case "replaceSubgraph": {
        const removeSet = new Set(op.removeNodeIds);
        nodes = nodes.filter((n) => !removeSet.has(n.id));
        edges = edges.filter(
          (e) => !removeSet.has(e.source) && !removeSet.has(e.target),
        );
        for (const remId of op.removeNodeIds) {
          delete positions[remId];
        }
        for (const newNode of op.addNodes) {
          if (!nodes.some((n) => n.id === newNode.id)) {
            nodes.push(newNode);
            if (!positions[newNode.id]) {
              positions[newNode.id] = { x: 250, y: 200 };
            }
          }
        }
        for (const newEdge of op.addEdges) {
          if (!edges.some((e) => e.id === newEdge.id)) {
            edges.push(newEdge);
          }
        }
        break;
      }

      case "renameWorkflow": {
        currentName = op.name;
        break;
      }

      case "setDescription": {
        currentDescription = op.description;
        break;
      }

      case "setOperationalPolicy": {
        operationalPolicy = {
          ...operationalPolicy,
          ...op.policy,
        };
        break;
      }

      case "autoLayoutSubset": {
        const nodeIds = [...new Set(op.nodeIds)];
        const missing = nodeIds.filter(
          (nodeId) => !nodes.some((node) => node.id === nodeId),
        );
        if (missing.length > 0) {
          throw new Error(
            `Cannot lay out missing node(s): ${missing.join(", ")}.`,
          );
        }

        const origin = op.origin ?? { x: 250, y: 120 };
        nodeIds.forEach((nodeId, index) => {
          positions[nodeId] =
            op.direction === "horizontal"
              ? { x: origin.x + index * op.gap, y: origin.y }
              : { x: origin.x, y: origin.y + index * op.gap };
        });
        break;
      }
    }
  }

  return {
    graph: {
      schemaVersion: 2,
      entryNodeId: input.graph.entryNodeId,
      nodes,
      edges,
    },
    layout: {
      positions,
      collapsedNodeIds,
    },
    name: currentName,
    description: currentDescription,
    operationalPolicy,
  };
}
