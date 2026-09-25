import "server-only";

import { createHash } from "node:crypto";
import type { JsonValue, WorkflowGraphV2, WorkflowNode } from "./definition/schema-v2";
import { evaluateConditions, type ConditionContext } from "./conditions";
import type { NodeOutcome } from "./runtime/advance";
import { simulate, type SimulationResult } from "./runtime/simulate";
import { defaultSimulationFixture } from "./runtime/simulation-fixtures";
import { getAutomationTool } from "./registry";
import { validateGraphActionInputs } from "./publish-validation";
import { getAutomationToolManifestV2 } from "./tool-manifests-v2";

export type SimulationScenario =
  | "all_true"
  | "all_false"
  | "action_failure"
  | "uncertain_result"
  | "timeout"
  | "approval_accepted"
  | "approval_rejected"
  | "approval_expired"
  | "wait_expired"
  | "wait_matched";

export const SIMULATION_SCENARIOS: readonly SimulationScenario[] = [
  "all_true",
  "all_false",
  "action_failure",
  "uncertain_result",
  "timeout",
  "approval_accepted",
  "approval_rejected",
  "approval_expired",
  "wait_expired",
  "wait_matched",
] as const;

export type ScenarioResult = {
  scenario: SimulationScenario;
  result: SimulationResult;
  visitedNodes: string[];
  status: "succeeded" | "failed" | "uncertain" | "needs_fixture" | "invalid";
};

/**
 * How much a covered node's outcome can actually be trusted (AI16). Distinct
 * from `ScenarioResult.status` (per-scenario) and `BranchCoverageReport.status`
 * (aggregate): this is a per-node confidence level so the UI/model can tell
 * "we exercised this node's real virtual-state logic" apart from "we assumed
 * a synthetic success value for it".
 *
 * - `validated`: a non-action node (trigger, condition, delay, approval,
 *   wait, end) whose branch/timing logic was structurally exercised by the
 *   compiler/simulator.
 * - `virtually_executed`: an action node whose tool declares
 *   `simulation.mode === "stateful"` — the simulator applied a real virtual
 *   state transition for it, not just a canned fixture value.
 * - `fixture_assumed`: an action node whose tool declares
 *   `simulation.mode === "fixture"` — its outcome is a synthetic value the
 *   simulator assumed succeeded; the node was never actually exercised.
 * - `integration_unchecked`: an action node whose tool declares
 *   `simulation.mode === "unsupported"`, or whose action type/version has no
 *   manifest at all — there is no simulated evidence for it whatsoever.
 * - `live_verified`: reserved for a future controlled dry-run against a real
 *   provider (see docs/harly-ai-automations-integration-audit-2026-09-16.md
 *   §9, "live test"). `runBranchCoverageSimulation` never calls a real
 *   provider, so no node reaches this level through it today.
 */
export type NodeCoverageLevel =
  | "validated"
  | "virtually_executed"
  | "fixture_assumed"
  | "integration_unchecked"
  | "live_verified";

export type BranchCoverageReport = {
  scenarios: ScenarioResult[];
  allNodeIds: string[];
  coveredNodeIds: string[];
  uncoveredNodeIds: string[];
  coveragePercent: number;
  simulationHash: string;
  status: "verified" | "partial" | "failed";
  /**
   * Confidence level per covered node id (AI16). Nodes in `uncoveredNodeIds`
   * are intentionally absent — "not covered" is already the strongest
   * signal for them.
   */
  nodeCoverageLevels: Record<string, NodeCoverageLevel>;
  triggerContext: Record<string, unknown>;
  conditionContext: Partial<Omit<ConditionContext, "trigger">> | null;
};

/** Classifies a single node's simulated evidence level (AI16). */
function coverageLevelForNode(node: WorkflowNode): NodeCoverageLevel {
  if (node.type !== "action") return "validated";
  const manifest = getAutomationToolManifestV2(node.actionType, node.toolVersion);
  if (!manifest) return "integration_unchecked";
  switch (manifest.simulation.mode) {
    case "stateful":
      return "virtually_executed";
    case "fixture":
      return "fixture_assumed";
    case "unsupported":
    default:
      return "integration_unchecked";
  }
}

/**
 * Runs multiscenario branch coverage simulation on a graph (Phase 3, AI05 & AI06).
 * Simulates:
 * 1. "all_true": conditions evaluate to true, approvals to approved, waits to matched/completed
 * 2. "all_false": conditions evaluate to false
 * 3. "action_failure": first action fails with simulated error
 * 4. "uncertain_result": first action returns a durable uncertainty
 * 5. "timeout": first action times out and remains retryable
 * 6. "approval_accepted": approvals take the accepted branch explicitly
 * 7. "approval_rejected": approvals rejected
 * 8. "approval_expired": approval deadlines expire
 * 9. "wait_expired": waits expire
 * 10. "wait_matched": event/document waits resolve on their match branch
 *
 * Computes deterministic simulationHash and branch coverage statistics.
 */
export function runBranchCoverageSimulation(input: {
  graph: WorkflowGraphV2;
  trigger: Record<string, unknown>;
  /** Fixture-only normalized context for condition evaluation. */
  conditionContext?: Partial<Omit<ConditionContext, "trigger">>;
  preflightIssues?: Array<{ nodeId: string; fieldPath: string; message: string }>;
  scenarios?: SimulationScenario[];
}): BranchCoverageReport {
  const targetScenarios = input.scenarios ?? [
    "all_true",
    "all_false",
    "action_failure",
    "uncertain_result",
    "timeout",
    "approval_accepted",
    "approval_rejected",
    "approval_expired",
    "wait_expired",
    "wait_matched",
  ];

  const allNodeIds = input.graph.nodes.map((n) => n.id);
  const coveredNodesSet = new Set<string>();
  const scenarioResults: ScenarioResult[] = [];

  for (const scenario of targetScenarios) {
    // Build fixtures per scenario
    const fixtures: Record<string, NodeOutcome> = {};
    for (const node of input.graph.nodes) {
      if (node.type === "action") {
        if (scenario === "action_failure") {
          fixtures[node.id] = {
            status: "failed",
            code: "SIMULATED_ACTION_FAILURE",
            retryable: false,
          };
        } else if (scenario === "uncertain_result") {
          fixtures[node.id] = {
            status: "uncertain",
            code: "SIMULATED_UNCERTAIN_RESULT",
          };
        } else if (scenario === "timeout") {
          fixtures[node.id] = {
            status: "failed",
            code: "SIMULATED_TIMEOUT",
            retryable: true,
            details: { category: "network", retryAdvice: "after_backoff" },
          };
        } else {
          fixtures[node.id] = defaultSimulationFixture(node, "success");
        }
      } else if (node.type === "delay") {
        fixtures[node.id] = defaultSimulationFixture(node, "success");
      } else if (node.type === "approval") {
        if (scenario === "approval_rejected") {
          fixtures[node.id] = {
            status: "succeeded",
            output: { simulated: true, approved: false },
            port: "rejected",
          };
        } else if (scenario === "approval_expired") {
          fixtures[node.id] = {
            status: "succeeded",
            output: { simulated: true, approved: false, expired: true },
            port: "expired",
          };
        } else {
          fixtures[node.id] = {
            status: "succeeded",
            output: { simulated: true, approved: true },
            port: "approved",
          };
        }
      } else if (node.type === "wait") {
        if (scenario === "wait_expired") {
          fixtures[node.id] = {
            status: "succeeded",
            output: { simulated: true, expired: true },
            port: "expired",
          };
        } else if (scenario === "wait_matched") {
          fixtures[node.id] = {
            status: "succeeded",
            output: { simulated: true, matched: true, completed: true },
            port: node.kind === "document_package" ? "completed" : "matched",
          };
        } else {
          fixtures[node.id] = defaultSimulationFixture(node, "success");
        }
      }
    }

    const triggerRecord = input.trigger;
    const conditionContext: ConditionContext = {
      workspaceId: "simulation",
      candidate: isRecord(triggerRecord.candidate) ? triggerRecord.candidate : triggerRecord,
      application: isRecord(triggerRecord.application) ? triggerRecord.application : null,
      job: isRecord(triggerRecord.job) ? triggerRecord.job : null,
      ai: isRecord(triggerRecord.ai) ? triggerRecord.ai : null,
      trigger: triggerRecord,
      ...input.conditionContext,
    };
    const virtualConditionContext: ConditionContext = structuredClone(conditionContext);
    const evaluateCondition = (tree: Parameters<typeof evaluateConditions>[0]) =>
      scenario === "all_false"
        ? false
        : evaluateConditions(tree, virtualConditionContext).matched;

    const sim = simulate({
      graph: input.graph,
      trigger: input.trigger as unknown as JsonValue,
      fixtures,
      preflightIssues: [
        ...(input.preflightIssues ?? []),
        ...validateGraphActionInputs(input.graph, getAutomationTool),
      ],
      validateResolvedActionInput: (node, value) => {
        const tool = getAutomationTool(node.actionType, node.toolVersion);
        if (!tool) {
          return [
            {
              nodeId: node.id,
              fieldPath: "actionType",
              message: `${node.actionType} tool version ${node.toolVersion} is not available to run.`,
            },
          ];
        }
        const parsed = tool.schema.safeParse(value);
        if (parsed.success) return [];
        return parsed.error.issues.map((issue) => ({
          nodeId: node.id,
          fieldPath: issue.path.length
            ? `input.${issue.path.map(String).join(".")}`
            : "input",
          message: issue.message,
        }));
      },
      evaluateCondition,
      virtualState: virtualConditionContext,
      applyVirtualAction: (node, _value, outcome, state) => {
        if (!state || typeof outcome.output !== "object" || outcome.output === null || Array.isArray(outcome.output)) return;
        const context = state as ConditionContext;
        if (node.actionType === "ai_score") {
          context.ai = { ...outcome.output };
        }
      },
    });

    const visitedNodes: string[] = [];
    let status: ScenarioResult["status"] = "succeeded";

    if (sim.type === "finished") {
      for (const t of sim.trace) {
        visitedNodes.push(t.nodeId);
        coveredNodesSet.add(t.nodeId);
      }
      if (sim.result.status === "failed" && scenario !== "action_failure") {
        status = "failed";
      }
      if (sim.result.status === "uncertain") status = "uncertain";
    } else if (sim.type === "needs_fixture") {
      status = "needs_fixture";
      for (const t of sim.trace) {
        visitedNodes.push(t.nodeId);
        coveredNodesSet.add(t.nodeId);
      }
    } else if (sim.type === "invalid") {
      status = "invalid";
    }

    scenarioResults.push({
        scenario,
        result: sim,
      visitedNodes,
      status,
    });
  }

  const coveredNodeIds = Array.from(coveredNodesSet);
  const uncoveredNodeIds = allNodeIds.filter((id) => !coveredNodesSet.has(id));
  const coveragePercent =
    allNodeIds.length === 0
      ? 100
      : Math.round((coveredNodeIds.length / allNodeIds.length) * 100);

  // Compute deterministic simulation hash across graph nodes + covered branches
  const hashDigest = createHash("sha256")
    .update(
      JSON.stringify({
        nodeIds: allNodeIds.sort(),
        coveredNodeIds: coveredNodeIds.sort(),
        scenarioStatuses: scenarioResults.map((s) => ({
          scenario: s.scenario,
          status: s.status,
        })),
        trigger: input.trigger,
        conditionContext: input.conditionContext ?? null,
      }),
    )
    .digest("hex");

  const expectedTerminalScenario = (scenario: SimulationScenario) =>
    scenario === "action_failure" ||
    scenario === "timeout" ||
    scenario === "uncertain_result" ||
    scenario === "approval_rejected" ||
    scenario === "approval_expired" ||
    scenario === "wait_expired";
  const status =
    coveragePercent === 100 &&
    scenarioResults.every((s) =>
      s.status === "succeeded" ||
      (expectedTerminalScenario(s.scenario) &&
        (s.status === "failed" || s.status === "uncertain")),
    )
      ? "verified"
      : coveragePercent > 0
        ? "partial"
        : "failed";

  const nodesById = new Map(input.graph.nodes.map((node) => [node.id, node]));
  const nodeCoverageLevels: Record<string, NodeCoverageLevel> = {};
  for (const nodeId of coveredNodeIds) {
    const node = nodesById.get(nodeId);
    if (node) nodeCoverageLevels[nodeId] = coverageLevelForNode(node);
  }

  return {
    scenarios: scenarioResults,
    allNodeIds,
    coveredNodeIds,
    uncoveredNodeIds,
    coveragePercent,
    simulationHash: hashDigest,
    status,
    nodeCoverageLevels,
    triggerContext: input.trigger,
    conditionContext: input.conditionContext ?? null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
