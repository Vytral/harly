import { compileGraph } from "../definition/compile";
import type { GraphValidationIssue } from "../definition/issues";
import { z } from "zod";
import type { Conditions } from "../schema";
import {
  jsonValueSchema,
  type JsonValue,
  type WorkflowNode,
} from "../definition/schema-v2";
import {
  advance,
  type AdvanceDecision,
  type ExecutionSnapshot,
  type NodeOutcome,
} from "./advance";
import { nextLocalDeadline } from "./local-time";

const nodeIdKeySchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/);

/** Runtime boundary for fixtures supplied by the client Test tab. */
export const simulationNodeOutcomeSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("succeeded"),
    output: jsonValueSchema,
    port: z.string().min(1).max(40).optional(),
    providerRef: z.string().max(200).optional(),
  }),
  z.object({
    status: z.literal("failed"),
    code: z.string().min(1).max(120),
    retryable: z.boolean().optional(),
    providerRef: z.string().max(200).optional(),
  }),
  z.object({
    status: z.literal("uncertain"),
    code: z.string().min(1).max(120),
  }),
]);

export const simulationFixturesSchema = z.record(
  nodeIdKeySchema,
  simulationNodeOutcomeSchema,
);

export type SimulationTrace = {
  nodeId: string;
  decision: AdvanceDecision;
  /** Clock value at which this decision is observed. */
  virtualTime: string;
  /** Milliseconds advanced after a simulated wait resolves. */
  waitedMs?: number;
};
export type SimulationResult =
  | { type: "invalid"; issues: GraphValidationIssue[] }
  | {
      type: "needs_fixture";
      nodeId: string;
      trace: SimulationTrace[];
      snapshot: ExecutionSnapshot;
    }
  | {
      type: "finished";
      result: Extract<AdvanceDecision, { type: "finish" }>;
      trace: SimulationTrace[];
      snapshot: ExecutionSnapshot;
    };

export type SimulationFixtures = Record<string, NodeOutcome>;

/**
 * Effects come exclusively from explicit fixtures. No registry/provider/DB imports.
 * Missing fixtures suspend simulation; they never fabricate a successful delivery.
 * Conditions use the same evaluator supplied by the server runtime adapter.
 */
export function simulate(input: {
  graph: unknown;
  trigger: JsonValue;
  fixtures: Record<string, NodeOutcome>;
  /** Server-side tool-schema preflight; invalid bindings must not be faked as success. */
  preflightIssues?: GraphValidationIssue[];
  /** Validates the concrete binding values exactly before a fixture is used. */
  validateResolvedActionInput?: (
    node: Extract<WorkflowNode, { type: "action" }>,
    value: Record<string, JsonValue>,
  ) => GraphValidationIssue[];
  /** Verifies successful fixture output against the immutable tool version. */
  validateFixtureOutput?: (
    node: Extract<WorkflowNode, { type: "action" }>,
    output: JsonValue,
  ) => GraphValidationIssue[];
  /** Receives mutable virtual state, never a live domain object. */
  evaluateCondition: (conditions: Conditions, state?: unknown) => boolean;
  /** Applies a supported internal action to virtual state after fixture success. */
  applyVirtualAction?: (
    node: Extract<WorkflowNode, { type: "action" }>,
    value: Record<string, JsonValue>,
    outcome: Extract<NodeOutcome, { status: "succeeded" }>,
    state: unknown,
  ) => void;
  virtualState?: unknown;
  /** Defaults to the trigger's occurredAt or the current time. */
  startedAt?: Date | string;
}): SimulationResult {
  const compiled = compileGraph(input.graph);
  if (!compiled.ok) return { type: "invalid", issues: compiled.issues };
  if (input.preflightIssues?.length) {
    return { type: "invalid", issues: structuredClone(input.preflightIssues) };
  }
  const plan = compiled.plan;
  const snapshot: ExecutionSnapshot = {
    contentHash: plan.contentHash,
    nodeId: plan.entryNodeId,
    trigger: structuredClone(input.trigger),
    outcomes: Object.create(null),
    warnings: [],
    cancelled: false,
  };
  const trace: SimulationTrace[] = [];
  let virtualTime = simulationStart(input.startedAt, input.trigger);
  // A valid DAG visits each node once; at most one request + one result per node.
  const budget = plan.topoOrder.length * 2 + 1;
  for (let step = 0; step < budget; step++) {
    const decision = advance(plan, snapshot);
    const traceRow: SimulationTrace = {
      nodeId: snapshot.nodeId,
      decision,
      virtualTime: new Date(virtualTime).toISOString(),
    };
    trace.push(traceRow);
    if (decision.type === "finish")
      return { type: "finished", result: decision, trace, snapshot };
    if (decision.type === "next") {
      snapshot.nodeId = decision.nodeId;
      snapshot.warnings = decision.warnings;
      continue;
    }
    if (decision.type === "condition") {
      try {
        const matched = input.evaluateCondition(
          decision.node.tree,
          input.virtualState,
        );
        snapshot.outcomes[snapshot.nodeId] = {
          status: "succeeded",
          output: { matched },
          port: matched ? "true" : "false",
        };
      } catch {
        snapshot.outcomes[snapshot.nodeId] = {
          status: "failed",
          code: "CONDITION_EVALUATION_FAILED",
        };
      }
      continue;
    }
    if (decision.type === "action" && input.validateResolvedActionInput) {
      const issues = input.validateResolvedActionInput(decision.node, decision.input);
      if (issues.length > 0) return { type: "invalid", issues };
    }
    const fixture = Object.hasOwn(input.fixtures, snapshot.nodeId)
      ? input.fixtures[snapshot.nodeId]
      : undefined;
    if (!fixture)
      return {
        type: "needs_fixture",
        nodeId: snapshot.nodeId,
        trace,
        snapshot,
      };
    const copiedFixture = structuredClone(fixture);
    if (
      decision.type === "action" &&
      copiedFixture.status === "succeeded" &&
      input.validateFixtureOutput
    ) {
      const issues = input.validateFixtureOutput(decision.node, copiedFixture.output);
      if (issues.length > 0) return { type: "invalid", issues };
    }
    snapshot.outcomes[snapshot.nodeId] = copiedFixture;
    if (
      decision.type === "action" &&
      copiedFixture.status === "succeeded" &&
      input.applyVirtualAction
    ) {
      input.applyVirtualAction(
        decision.node,
        decision.input,
        copiedFixture,
        input.virtualState,
      );
    }
    if (fixture.status === "succeeded" && decision.type === "wait") {
      const waitedMs = waitDurationMs(decision.node, virtualTime);
      virtualTime += waitedMs;
      traceRow.waitedMs = waitedMs;
    }
  }
  return {
    type: "finished",
    result: { type: "finish", status: "failed", code: "SIMULATION_STEP_LIMIT" },
    trace,
    snapshot,
  };
}

function simulationStart(
  startedAt: Date | string | undefined,
  trigger: JsonValue,
): number {
  if (startedAt) {
    const value = new Date(startedAt).getTime();
    if (Number.isFinite(value)) return value;
  }
  if (trigger && typeof trigger === "object" && !Array.isArray(trigger)) {
    const occurredAt = trigger.occurredAt;
    if (typeof occurredAt === "string") {
      const value = new Date(occurredAt).getTime();
      if (Number.isFinite(value)) return value;
    }
  }
  return Date.now();
}

function waitDurationMs(
  node: Extract<WorkflowNode, { type: "delay" | "approval" | "wait" }>,
  nowMs: number,
): number {
  if (node.type !== "delay") return 0;
  if (node.mode === "duration") return node.durationMs ?? 0;
  if (!node.localTime) return 0;

  try {
    return nextLocalDeadline(node.localTime, node.timeZone, new Date(nowMs)).getTime() - nowMs;
  } catch {
    // Validation rejects invalid IANA zones before publication. A malformed
    // draft does not advance to an invented wall-clock instant.
    return 0;
  }
}
