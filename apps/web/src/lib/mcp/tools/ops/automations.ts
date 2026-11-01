import "server-only";

import { z } from "zod";

import {
  approveWorkflowAction,
  cancelRunAction,
  deleteWorkflowAction,
  dryRunWorkflowAction,
  getRunAction,
  getWorkflowAction,
  getWorkflowMetricsAction,
  listPendingWorkflowApprovalsAction,
  listRunsAction,
  listWorkflowsAction,
  listWorkflowVersionsAction,
  publishWorkflowAction,
  replayRunFromStepAction,
  requestWorkflowApprovalAction,
  resolveRunApprovalAction,
  retryRunAction,
  rollbackWorkflowAction,
  setWorkspaceAutomationEnabledAction,
  toggleWorkflowAction,
} from "@/features/automations/actions";
import { getWorkspaceAutomationPolicy } from "@/features/automations/data";
import {
  applyAutomationProposal,
  createAutomationProposalPreviewToken,
  getAutomationAiContext,
  getAutomationProposal,
  nextStepAfterAutomationSimulation,
  prepareAutomationProposal,
  simulateAutomationProposal,
  type AutomationProposal,
} from "@/features/automations/ai-proposals";
import {
  applyPatchToGraph,
  type OperationalPolicyPatch,
  automationPatchV1Schema,
  automationPlanV1Schema,
  compilePlanToGraph,
} from "@/features/automations/definition/plan-compiler";
import {
  editorLayoutSchema,
  emptyCanvasGraph,
  emptyLayout,
  parseGraph,
} from "@/features/automations/definition/schema-v2";
import { rebaseAutomationPatch } from "@/features/automations/definition/subgraph";
import { listAutomationToolManifestsV2 } from "@/features/automations/registry";
import { resolveAutomationResources } from "@/features/automations/resource-resolution";
import { getWorkflowRunDiagnosis, prepareAutomationRepair } from "@/features/automations/run-repair";
import { WORKFLOW_EVENTS } from "@/features/automations/schema";
import { SIMULATION_SCENARIOS } from "@/features/automations/simulation-coverage";

import { defineMcpTool, McpToolError, type McpToolDefinition } from "../../types";
import {
  appLink,
  assertActionOk,
  boundJson,
  guarded,
  matchesQuery,
  pageFields,
  paginateArray,
  parseOrThrow,
  redactSecrets,
} from "./shared";

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const AUTOMATIONS_PATH = "/dashboard/automations";

type SerializedWorkflow = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  status: string;
  triggerEvent: string;
  engineVersion: number;
  draftRevision: number;
  contentHash: string;
  hasUnpublishedChanges: boolean;
  publishedAt: string | null;
  approvalRequestedAt: string | null;
  approvedAt: string | null;
  updatedAt: string;
  createdAt: string;
  circuitOpenUntil: string | null;
};

/** One row of the automations list. Pure; exported for tests. */
export function formatWorkflowSummary(workflow: SerializedWorkflow, origin: string) {
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    status: workflow.status,
    enabled: workflow.enabled,
    triggerEvent: workflow.triggerEvent,
    engineVersion: workflow.engineVersion,
    draftRevision: workflow.draftRevision,
    hasUnpublishedChanges: workflow.hasUnpublishedChanges,
    approvalRequestedAt: workflow.approvalRequestedAt,
    approvedAt: workflow.approvedAt,
    publishedAt: workflow.publishedAt,
    circuitOpenUntil: workflow.circuitOpenUntil,
    updatedAt: workflow.updatedAt,
    url: appLink(origin, `${AUTOMATIONS_PATH}/${workflow.id}`),
  };
}

type RunLike = {
  id: string;
  workflowId: string;
  triggerEvent: string;
  status: string;
  logicalStatus: string | null;
  attemptCount: number;
  maxAttempts: number;
  durationMs: number | null;
  startedAt: string;
  finishedAt: string | null;
  replayOfRunId: string | null;
  cancelRequestedAt: string | null;
  error: unknown;
};

/** One automation run without its payload. Pure; exported for tests. */
export function formatRunSummary(run: RunLike) {
  return {
    id: run.id,
    workflowId: run.workflowId,
    triggerEvent: run.triggerEvent,
    status: run.status,
    logicalStatus: run.logicalStatus,
    attempts: `${run.attemptCount}/${run.maxAttempts}`,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    durationMs: run.durationMs,
    cancelRequested: Boolean(run.cancelRequestedAt),
    replayOfRunId: run.replayOfRunId,
    error: run.error ? boundJson(redactSecrets(run.error), { maxString: 400, maxDepth: 3 }) : null,
  };
}

type NodeLike = { id: string; type: string; [key: string]: unknown };

/** Compact description of a proposal (no full graph). Pure; exported for tests. */
export function formatProposal(proposal: AutomationProposal) {
  const nodes = (proposal.graph.nodes as NodeLike[]).map((node) => ({
    id: node.id,
    type: node.type,
    ...(typeof node.actionType === "string" ? { actionType: node.actionType } : {}),
    ...(typeof node.event === "string" ? { event: node.event } : {}),
    ...(typeof node.name === "string" ? { name: node.name } : {}),
  }));
  const simulation = proposal.simulation;
  return {
    proposalId: proposal.id,
    workflowId: proposal.workflowId,
    isNewAutomation: proposal.workflowId === null,
    name: proposal.name,
    description: proposal.description,
    status: proposal.status,
    baseRevision: proposal.baseRevision,
    expiresAt: proposal.expiresAt,
    validationIssues: proposal.issues.slice(0, 25),
    validationIssueCount: proposal.issues.length,
    nodes,
    edgeCount: proposal.graph.edges.length,
    changes: proposal.diff.slice(0, 60).map((entry) => ({ kind: entry.kind, id: entry.id })),
    changeCount: proposal.diff.length,
    simulation: simulation ? { status: simulation.status, simulatedAt: simulation.simulatedAt } : null,
  };
}

function nextStepForProposal(proposal: AutomationProposal): string {
  if (proposal.issues.length > 0) {
    return "Fix the validation issues: prepare a new proposal (the old one cannot be edited).";
  }
  if (!proposal.simulation) return "Run automations_simulate_proposal on this proposal.";
  return "Review the changes, then call automations_apply_proposal to save them as a draft.";
}

async function currentContext(workflowId: string, userId: string, workspaceId: string) {
  return guarded(() => getAutomationAiContext({ workspaceId, actorId: userId, workflowId }), "Could not load the automation.");
}

const PLAN_GUIDE =
  "plan = { version: 1, name, description?, trigger: { event, filter: { field: value } }, steps?: [{ id, actionType, input: { ... }, name?, failurePolicy?: 'stop'|'route_error'|'continue' }], flow?: ordered items of { kind:'action', step } | { kind:'branch', id, conditions, trueFlow, falseFlow } | { kind:'delay', id, mode:'duration'|'next_local', durationMs } | { kind:'approval', id, eligibleActorIds, rule:'any'|'all', approvedFlow, rejectedFlow, expiredFlow } | { kind:'wait', id, waitKind:'event'|'document_package', eventName, matchedFlow, expiredFlow }, operationalPolicy? }. Prefer `flow` when order matters. Ids are alphanumeric. Valid trigger events and actionTypes with their inputs come from automations_catalog; stage, member, template and document ids come from automations_resolve_resources. Never invent ids.";

export const automationsTools: McpToolDefinition[] = [
  // ----- Reads ---------------------------------------------------------------
  defineMcpTool({
    name: "automations_list",
    title: "List automations",
    description:
      "List workspace automations (workflows) with state: status (draft / published / paused ...), enabled flag, trigger event, draft revision, whether there are unpublished changes and when each was last updated. Filter by name text or status. Returns ids for automations_get, automations_runs_list, automations_set_enabled and the other automation tools.",
    group: "automations",
    scope: "automations:read",
    permission: "automations:manage",
    annotations: READ,
    input: z.object({
      query: z.string().trim().max(120).optional().describe("Match against name and description."),
      status: z.string().trim().max(30).optional().describe("Only this status, e.g. draft, published, paused."),
      ...pageFields,
    }),
    async run(input, ctx) {
      const result = await listWorkflowsAction();
      assertActionOk(result, "Could not load automations.");
      const workflows = ((result.workflows ?? []) as SerializedWorkflow[]).filter(
        (workflow) => (!input.status || workflow.status === input.status) && matchesQuery(input.query, workflow.name, workflow.description),
      );
      const page = paginateArray(workflows, input.limit, input.offset);
      return { ...page, items: page.items.map((workflow) => formatWorkflowSummary(workflow, ctx.appOrigin)) };
    },
  }),

  defineMcpTool({
    name: "automations_get",
    title: "Get an automation graph",
    description:
      "Read one automation: state, the full workflow graph (nodes and edges), the draft revision and content hash (needed by automations_prepare_patch / automations_publish), and current validation issues. For very large graphs pass nodeIds (+ depth) or limit to also receive a paginated subgraph slice. The graph in this response is the saved draft.",
    group: "automations",
    scope: "automations:read",
    permission: "automations:manage",
    annotations: READ,
    input: z.object({
      workflowId: z.string().uuid().describe("Automation id from automations_list."),
      nodeIds: z.array(z.string().min(1).max(80)).max(200).optional().describe("Focus node ids for a subgraph slice."),
      depth: z.number().int().min(0).max(5).optional().describe("Neighborhood hops around nodeIds."),
      limit: z.number().int().min(1).max(100).optional().describe("Max nodes in the subgraph slice."),
      cursor: z.string().max(200).optional().describe("Subgraph cursor from a previous response."),
    }),
    async run(input, ctx) {
      const context = await guarded(
        () =>
          getAutomationAiContext({
            workspaceId: ctx.workspaceId,
            actorId: ctx.userId,
            workflowId: input.workflowId,
            nodeIds: input.nodeIds,
            depth: input.depth,
            limit: input.limit,
            cursor: input.cursor,
          }),
        "Could not load the automation.",
      );
      const detail = await getWorkflowAction(input.workflowId);
      assertActionOk(detail, "Could not load the automation.");
      const summary = detail.workflow ? formatWorkflowSummary(detail.workflow as unknown as SerializedWorkflow, ctx.appOrigin) : null;
      return {
        ...(summary ?? { id: context.workflowId, name: context.name, status: context.status }),
        draftRevision: context.draftRevision,
        contentHash: context.contentHash,
        graph: context.graph,
        ...("subgraph" in context && context.subgraph ? { subgraph: context.subgraph } : {}),
        validationIssues: context.validationIssues,
      };
    },
  }),

  defineMcpTool({
    name: "automations_catalog",
    title: "Automation triggers and actions catalog",
    description:
      "What automations can do. Without arguments returns the trigger events and every action (type, label, description, category, whether it is an external write such as sending email, required permissions and integrations). Pass actionType for the full contract of one action: input fields, outputs, simulation behaviour and examples. Always use this before building a plan; never invent action types or inputs.",
    group: "automations",
    scope: "automations:read",
    permission: "automations:manage",
    annotations: READ,
    input: z.object({
      actionType: z.string().trim().max(80).optional().describe("Action type to describe in full, e.g. send_email."),
      category: z.string().trim().max(40).optional().describe("Only actions in this category (candidate, documents, interviews, offers, tasks, messaging, integrations)."),
    }),
    async run(input) {
      const manifests = listAutomationToolManifestsV2();
      if (input.actionType) {
        const matches = manifests.filter((manifest) => manifest.type === input.actionType);
        if (matches.length === 0) throw new McpToolError(`Unknown action type "${input.actionType}".`, "not_found");
        return { actions: matches };
      }
      return {
        triggers: [...WORKFLOW_EVENTS],
        actions: manifests
          .filter((manifest) => !input.category || manifest.category === input.category)
          .map((manifest) => ({
            type: manifest.type,
            version: manifest.version,
            label: manifest.label,
            description: manifest.description,
            category: manifest.category,
            effect: manifest.effect,
            requiredPermissions: manifest.requiredPermissions,
            integrationRequirements: manifest.integrationRequirements,
            targetFields: manifest.targetFields,
            outputFields: manifest.outputFields,
          })),
        simulationScenarios: [...SIMULATION_SCENARIOS],
      };
    },
  }),

  defineMcpTool({
    name: "automations_resolve_resources",
    title: "Find ids for automation settings",
    description:
      "Look up real workspace entities that automation actions need: pipeline stages (optionally for a job), active members, email templates, document templates, documents, interviews, offers, Cal.com event types, webhook secret NAMES (never values), webhook endpoints, connected integrations and jobs. Returns id + name per item with paging. Never invent ids; resolve them here first.",
    group: "automations",
    scope: "automations:read",
    permission: "automations:manage",
    annotations: READ,
    input: z.object({
      resourceType: z
        .enum(["stage", "member", "email_template", "document_template", "document", "webhook_secret", "webhook_endpoint", "interview", "offer", "cal_event_type", "integration", "job"])
        .describe("What to look up."),
      query: z.string().trim().max(120).optional().describe("Filter by name."),
      jobId: z.string().uuid().optional().describe("For resourceType=stage: limit to this job's stages."),
      limit: z.number().int().min(1).max(50).default(20).describe("Max items (1-50)."),
      cursor: z.string().max(300).optional().describe("nextCursor from a previous response."),
    }),
    async run(input, ctx) {
      return guarded(
        () =>
          resolveAutomationResources({
            workspaceId: ctx.workspaceId,
            actorId: ctx.userId,
            resourceType: input.resourceType,
            query: input.query,
            jobId: input.jobId,
            limit: input.limit,
            cursor: input.cursor,
          }),
        "Could not look up resources.",
      );
    },
  }),

  defineMcpTool({
    name: "automations_versions_list",
    title: "Automation version history",
    description: "Published versions of an automation (version number, name, trigger, who published and when). Use a version number with automations_rollback.",
    group: "automations",
    scope: "automations:read",
    permission: "automations:manage",
    annotations: READ,
    input: z.object({ workflowId: z.string().uuid().describe("Automation id from automations_list.") }),
    async run(input) {
      const result = await listWorkflowVersionsAction(input.workflowId);
      assertActionOk(result, "Could not load versions.");
      return {
        versions: (result.versions ?? []).map((version) => ({
          version: version.version,
          name: version.name,
          description: version.description,
          triggerEvent: version.triggerEvent,
          publishedAt: version.publishedAt,
          publishedById: version.publishedById,
          approvedAt: version.approvedAt,
          createdAt: version.createdAt,
        })),
      };
    },
  }),

  defineMcpTool({
    name: "automations_metrics",
    title: "Automation run metrics",
    description: "Run statistics for one automation (totals by outcome, recent failures, durations) as shown on its detail page.",
    group: "automations",
    scope: "automations:read",
    permission: "automations:manage",
    annotations: READ,
    input: z.object({ workflowId: z.string().uuid().describe("Automation id from automations_list.") }),
    async run(input) {
      const result = await getWorkflowMetricsAction(input.workflowId);
      assertActionOk(result, "Could not load metrics.");
      return boundJson(result.metrics, { maxString: 300, maxArray: 30 });
    },
  }),

  defineMcpTool({
    name: "automations_runs_list",
    title: "List automation runs",
    description:
      "Recent runs (executions) of automations, newest first, with status, trigger event, attempts, timing and a short error. Filter by workflowId and status (e.g. failed, uncertain, running). Use automations_run_get for steps and automations_run_diagnose to see why a run failed.",
    group: "automations",
    scope: "automations:read",
    permission: "automations:manage",
    annotations: READ,
    input: z.object({
      workflowId: z.string().uuid().optional().describe("Only runs of this automation."),
      status: z.string().trim().max(30).optional().describe("Only runs with this status."),
      ...pageFields,
    }),
    async run(input) {
      const result = await listRunsAction({ workflowId: input.workflowId, limit: 100 });
      assertActionOk(result, "Could not load runs.");
      const runs = ((result.runs ?? []) as unknown as RunLike[]).filter((run) => !input.status || run.status === input.status);
      const page = paginateArray(runs, input.limit, input.offset);
      return { ...page, items: page.items.map(formatRunSummary) };
    },
  }),

  defineMcpTool({
    name: "automations_run_get",
    title: "Get an automation run",
    description:
      "One run with its steps (node id, action type, status, error code, retryable flag, timing). The trigger payload and step inputs/results can contain candidate data and are returned under `untrusted_text`, size-bounded and with secret-looking fields redacted.",
    group: "automations",
    scope: "automations:read",
    permission: "automations:manage",
    annotations: READ,
    input: z.object({ runId: z.string().uuid().describe("Run id from automations_runs_list.") }),
    async run(input) {
      const result = await getRunAction(input.runId);
      assertActionOk(result, "Could not load the run.");
      const run = result.run as unknown as RunLike & { triggerPayload?: unknown };
      return {
        ...formatRunSummary(run),
        untrusted_text: {
          triggerPayload: boundJson(redactSecrets(run.triggerPayload), { maxString: 300, maxDepth: 4 }),
        },
        steps: (result.steps ?? []).map((step) => ({
          nodeId: step.nodeId ?? null,
          stepIndex: step.stepIndex,
          actionType: step.actionType,
          status: step.status,
          retryable: step.retryable,
          attempts: step.attemptCount,
          errorCode: step.errorCode,
          startedAt: step.startedAt,
          finishedAt: step.finishedAt,
          untrusted_text: {
            input: boundJson(redactSecrets(step.actionInput), { maxString: 240, maxDepth: 3 }),
            result: boundJson(redactSecrets(step.result), { maxString: 240, maxDepth: 3 }),
          },
        })),
      };
    },
  }),

  defineMcpTool({
    name: "automations_run_diagnose",
    title: "Diagnose a failed run",
    description:
      "Explain a failed or uncertain run: lifecycle stage and reason, the failing node with its (redacted) error code and details, and the node-by-node timeline. Follow with automations_prepare_repair, automations_run_retry or automations_run_replay.",
    group: "automations",
    scope: "automations:read",
    permission: "automations:manage",
    annotations: READ,
    input: z.object({ runId: z.string().uuid().describe("Run id from automations_runs_list.") }),
    async run(input, ctx) {
      const diagnosis = await guarded(
        () => getWorkflowRunDiagnosis({ workspaceId: ctx.workspaceId, actorId: ctx.userId, runId: input.runId }),
        "Could not diagnose the run.",
      );
      return redactSecrets(boundJson(diagnosis, { maxString: 500, maxDepth: 5 }));
    },
  }),

  defineMcpTool({
    name: "automations_approvals_list",
    title: "Automation approvals waiting on me",
    description: "Approval steps inside running automations that you are eligible to decide (run, node, candidate, deadline). Decide with automations_run_resolve_approval.",
    group: "automations",
    scope: "automations:read",
    permission: "automations:manage",
    annotations: READ,
    input: z.object({}),
    async run() {
      const result = await listPendingWorkflowApprovalsAction();
      assertActionOk(result, "Could not load approvals.");
      return { approvals: result.approvals ?? [] };
    },
  }),

  defineMcpTool({
    name: "automations_workspace_status",
    title: "Workspace automation switch and limits",
    description: "Whether automations are running for the whole workspace (master switch), who paused them and why, and the workspace-wide rate limits.",
    group: "automations",
    scope: "automations:read",
    permission: "automations:manage",
    annotations: READ,
    input: z.object({}),
    async run(_input, ctx) {
      return { ...(await getWorkspaceAutomationPolicy(ctx.workspaceId)), url: appLink(ctx.appOrigin, AUTOMATIONS_PATH) };
    },
  }),

  // ----- Plan -> simulate -> apply pipeline (same validation as Harly AI) -----
  defineMcpTool({
    name: "automations_prepare_plan",
    title: "Prepare an automation from a plan",
    description:
      `Compile a high-level plan into a validated automation graph and store it as a reviewable PROPOSAL (nothing is saved to the automation yet, nothing runs). Omit workflowId to create a new automation; pass workflowId to replace an existing automation's draft with the plan. Returns proposalId, validation issues, the nodes and a change list. Then call automations_simulate_proposal and automations_apply_proposal. ${PLAN_GUIDE}`,
    group: "automations",
    scope: "automations:write",
    permission: "automations:manage",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    input: z.object({
      plan: z.record(z.string(), z.unknown()).describe("The automation plan object (see tool description)."),
      workflowId: z.string().uuid().optional().describe("Existing automation to replace the draft of. Omit to create a new automation."),
    }),
    async run(input, ctx) {
      const plan = parseOrThrow(automationPlanV1Schema, input.plan, "The plan");
      const compiled = guardedSync(() => compilePlanToGraph(plan), "The plan could not be compiled.");
      const base = input.workflowId ? await currentContext(input.workflowId, ctx.userId, ctx.workspaceId) : null;
      const proposal = await guarded(
        () =>
          prepareAutomationProposal({
            workspaceId: ctx.workspaceId,
            actorId: ctx.userId,
            workflowId: input.workflowId,
            expectedRevision: base?.draftRevision,
            expectedContentHash: base?.contentHash,
            name: plan.name,
            description: plan.description,
            graph: compiled.graph,
            layout: compiled.layout,
            operationalPolicy: compiled.operationalPolicy,
          }),
        "Could not prepare the automation proposal.",
      );
      return { ...formatProposal(proposal), nextStep: nextStepForProposal(proposal) };
    },
  }),

  defineMcpTool({
    name: "automations_prepare_patch",
    title: "Prepare an edit to an automation",
    description:
      "Prepare a reviewable PROPOSAL that edits an existing automation with compact patch operations, or creates one from a full graph. Nothing is saved or run yet. patch = { version: 1, operations: [{ op: 'addNode', node } | { op: 'removeNode', nodeId } | { op: 'configureNode', nodeId, patch } | { op: 'connect', source, port, target } | { op: 'disconnect', edgeId | source/port/target } | { op: 'replaceSubgraph', removeNodeIds, addNodes, addEdges } | { op: 'renameWorkflow', name } | { op: 'setDescription', description } | { op: 'setOperationalPolicy', policy } | { op: 'autoLayoutSubset', nodeIds }], baseRevision?, baseContentHash? }. Read the graph with automations_get first. Provide exactly one of patch or graph. Then call automations_simulate_proposal and automations_apply_proposal.",
    group: "automations",
    scope: "automations:write",
    permission: "automations:manage",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    input: z.object({
      workflowId: z.string().uuid().optional().describe("Automation to edit. Omit to create a new one (then a graph or a patch from the empty canvas)."),
      patch: z.record(z.string(), z.unknown()).optional().describe("Compact patch object (see tool description)."),
      graph: z.record(z.string(), z.unknown()).optional().describe("Complete workflow graph (schemaVersion, entryNodeId, nodes, edges). Use for a new or wholesale graph."),
      name: z.string().trim().min(1).max(120).optional().describe("Automation name. Required for a new automation; defaults to the current name when editing."),
      description: z.string().max(2000).nullable().optional().describe("Description, or null to clear. Defaults to the current one."),
      expectedRevision: z.number().int().positive().optional().describe("Draft revision you based the edit on (from automations_get). Defaults to the current revision."),
      expectedContentHash: z.string().length(64).optional().describe("Content hash you based the edit on (from automations_get). Defaults to the current hash."),
    }),
    async run(input, ctx) {
      if (Boolean(input.patch) === Boolean(input.graph)) {
        throw new McpToolError("Provide exactly one of patch or graph.", "invalid_input");
      }
      const base = input.workflowId ? await currentContext(input.workflowId, ctx.userId, ctx.workspaceId) : null;
      if (!base && !input.name) throw new McpToolError("A name is required for a new automation.", "invalid_input");
      const name = input.name ?? base?.name ?? "Untitled automation";
      let description = input.description === undefined ? (base?.description ?? null) : input.description;
      let graph: unknown = input.graph;
      let layout: unknown = base?.layout ?? emptyLayout();
      let operationalPolicy: OperationalPolicyPatch | undefined;

      if (input.patch) {
        const patch = parseOrThrow(automationPatchV1Schema, input.patch, "The patch");
        const baseGraph = base ? parseGraph(base.graph) : emptyCanvasGraph();
        const baseLayout = editorLayoutSchema.parse(base?.layout ?? emptyLayout());
        const hasBase =
          patch.baseRevision !== undefined || patch.baseContentHash !== undefined || patch.baseGraphHash !== undefined ||
          patch.baseSubgraphHash !== undefined || patch.baseNodeIds !== undefined;
        if (base && hasBase) {
          const rebase = rebaseAutomationPatch({
            patch,
            currentGraph: parseGraph(base.graph),
            currentRevision: input.expectedRevision ?? base.draftRevision,
            currentContentHash: input.expectedContentHash ?? base.contentHash,
          });
          if (!rebase.ok) {
            throw new McpToolError(
              `The patch base is stale for ${rebase.conflicts.join(", ") || "the workflow metadata"}. Re-read the automation with automations_get and rebuild the patch.`,
              "conflict",
            );
          }
        }
        const patched = guardedSync(
          () => applyPatchToGraph({ graph: baseGraph, layout: baseLayout, patch, name, description }),
          "The patch could not be applied.",
        );
        graph = patched.graph;
        layout = patched.layout;
        operationalPolicy = patched.operationalPolicy;
        description = patched.description ?? description;
      }

      const proposal = await guarded(
        () =>
          prepareAutomationProposal({
            workspaceId: ctx.workspaceId,
            actorId: ctx.userId,
            workflowId: input.workflowId,
            expectedRevision: input.workflowId ? (input.expectedRevision ?? base?.draftRevision) : undefined,
            expectedContentHash: input.workflowId ? (input.expectedContentHash ?? base?.contentHash) : undefined,
            name,
            description,
            graph,
            layout,
            operationalPolicy,
          }),
        "Could not prepare the automation proposal.",
      );
      return { ...formatProposal(proposal), nextStep: nextStepForProposal(proposal) };
    },
  }),

  defineMcpTool({
    name: "automations_prepare_repair",
    title: "Prepare a fix for a failed run",
    description:
      "Prepare a PROPOSAL that patches the automation's draft to fix what a failed run showed (see automations_run_diagnose). Historical runs are never changed. `explanation` records why; `patch` has the same format as in automations_prepare_patch. Then simulate and apply the proposal.",
    group: "automations",
    scope: "automations:write",
    permission: "automations:manage",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    input: z.object({
      runId: z.string().uuid().describe("The failed run id."),
      explanation: z.string().trim().min(1).max(500).describe("Why this patch fixes the failure."),
      patch: z.record(z.string(), z.unknown()).describe("Compact patch object (see automations_prepare_patch)."),
    }),
    async run(input, ctx) {
      const patch = parseOrThrow(automationPatchV1Schema, input.patch, "The patch");
      const proposal = await guarded(
        () =>
          prepareAutomationRepair({
            workspaceId: ctx.workspaceId,
            actorId: ctx.userId,
            runId: input.runId,
            patch,
            explanation: input.explanation,
          }),
        "Could not prepare the repair proposal.",
      );
      return { ...formatProposal(proposal), nextStep: nextStepForProposal(proposal) };
    },
  }),

  defineMcpTool({
    name: "automations_simulate_proposal",
    title: "Simulate an automation proposal",
    description:
      "Run the effect-free branch-coverage simulation on a prepared proposal: every condition branch, action failure, uncertain result, timeout, approval accepted/rejected/expired and wait matched/expired. No emails are sent and no providers are called; report it as a simulation. Required before automations_apply_proposal. If a passing report already exists for the same graph it is returned with reused=true.",
    group: "automations",
    scope: "automations:write",
    permission: "automations:manage",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    input: z.object({
      proposalId: z.string().uuid().describe("proposalId from automations_prepare_plan / _patch / _repair."),
      trigger: z.record(z.string(), z.unknown()).default({}).describe("Sample trigger payload envelope, e.g. { applicationId, candidateId, jobId }. Default {}."),
      scenarios: z.array(z.enum(SIMULATION_SCENARIOS as unknown as [string, ...string[]])).optional().describe("Scenarios to cover. Default: all."),
      force: z.boolean().default(false).describe("Re-run even if a passing simulation exists (only after fixing a failed one)."),
    }),
    async run(input, ctx) {
      const result = await guarded(
        () =>
          simulateAutomationProposal({
            workspaceId: ctx.workspaceId,
            actorId: ctx.userId,
            proposalId: input.proposalId,
            trigger: input.trigger,
            scenarios: input.scenarios as never,
            force: input.force,
          }),
        "Could not simulate the proposal.",
      );
      return {
        proposalId: input.proposalId,
        simulation: boundJson(result, { maxString: 300, maxArray: 40, maxDepth: 5 }),
        nextStep: nextStepAfterAutomationSimulation(result),
      };
    },
  }),

  defineMcpTool({
    name: "automations_apply_proposal",
    title: "Apply a simulated proposal as a draft",
    description:
      "Save a simulated, valid proposal into the automation as a DRAFT (creates the automation when the proposal was for a new one, or updates the existing draft with a revision check). It is NOT published and never runs; use automations_publish / automations_set_enabled afterwards. Safe to repeat: a second call returns replayed=true. Fails if the proposal has validation issues, was not simulated, expired (30 minutes) or the automation changed meanwhile.",
    group: "automations",
    scope: "automations:write",
    permission: "automations:manage",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    input: z.object({ proposalId: z.string().uuid().describe("proposalId of a simulated proposal.") }),
    async run(input, ctx) {
      const proposal = await guarded(
        () => getAutomationProposal({ workspaceId: ctx.workspaceId, actorId: ctx.userId, proposalId: input.proposalId }),
        "Could not load the proposal.",
      );
      if (!proposal.simulation) {
        throw new McpToolError("Simulate this proposal with automations_simulate_proposal before applying it.", "invalid_input");
      }
      const previewToken = createAutomationProposalPreviewToken({
        proposalId: proposal.id,
        graphHash: proposal.simulation.graphHash,
      });
      const result = await guarded(
        () =>
          applyAutomationProposal({
            workspaceId: ctx.workspaceId,
            actorId: ctx.userId,
            proposalId: input.proposalId,
            actionId: `mcp:${input.proposalId}`,
            previewToken,
          }),
        "Could not apply the proposal.",
      );
      return {
        workflowId: result.workflowId,
        draftRevision: result.draftRevision,
        replayed: result.replayed,
        published: false,
        url: appLink(ctx.appOrigin, `${AUTOMATIONS_PATH}/${result.workflowId}`),
        nextStep: "The draft is saved but not live. Review it, then publish with automations_publish (or enable with automations_set_enabled).",
      };
    },
  }),

  defineMcpTool({
    name: "automations_dry_run",
    title: "Test an automation draft",
    description:
      "Dry-run the saved draft of an automation against a sample candidate (candidateId from candidates_search) or webhook payload, with synthetic provider results (scenario success, action_failure or uncertain_wait). Shows which steps would match, run or fail. Nothing is executed or sent.",
    group: "automations",
    scope: "automations:read",
    permission: "automations:manage",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    input: z.object({
      workflowId: z.string().uuid().describe("Automation id from automations_list."),
      candidateId: z.string().uuid().optional().describe("Sample candidate to build the trigger payload from."),
      webhookPayload: z.record(z.string(), z.unknown()).optional().describe("Sample payload for webhook.received triggers."),
      scenario: z.enum(["success", "action_failure", "uncertain_wait"]).default("success").describe("Synthetic outcome for every action."),
    }),
    async run(input, ctx) {
      const base = await currentContext(input.workflowId, ctx.userId, ctx.workspaceId);
      const result = await dryRunWorkflowAction({
        graph: parseGraph(base.graph),
        workflowId: input.workflowId,
        candidateId: input.candidateId,
        webhookPayload: input.webhookPayload,
        scenario: input.scenario,
      });
      assertActionOk(result as { ok?: boolean; error?: string }, "The dry run failed.");
      const { ok: _ok, ...rest } = result;
      void _ok;
      return boundJson(rest, { maxString: 400, maxArray: 60, maxDepth: 5 });
    },
  }),

  // ----- Lifecycle -----------------------------------------------------------
  defineMcpTool({
    name: "automations_publish",
    title: "Publish an automation",
    description:
      "Publish the current draft so it goes LIVE and starts reacting to events (it may then email candidates or change records automatically). Needs expectedRevision from automations_get so you publish exactly what was reviewed; fails with the validation issues if the draft is not ready or if approval is required first (see automations_request_approval).",
    group: "automations",
    scope: "automations:write",
    permission: "automations:manage",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    input: z.object({
      workflowId: z.string().uuid().describe("Automation id."),
      expectedRevision: z.number().int().positive().describe("draftRevision from automations_get."),
    }),
    async run(input) {
      assertActionOk(await publishWorkflowAction(input.workflowId, input.expectedRevision), "Could not publish the automation.");
      return { published: true, workflowId: input.workflowId };
    },
  }),

  defineMcpTool({
    name: "automations_set_enabled",
    title: "Enable or disable an automation",
    description:
      "enabled=true: resume a paused automation, or publish the current draft of one that is not live yet. enabled=false: pause it (it stops reacting to new events; in-flight runs finish). Use automations_publish when you need to pin a revision.",
    group: "automations",
    scope: "automations:write",
    permission: "automations:manage",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    input: z.object({
      workflowId: z.string().uuid().describe("Automation id."),
      enabled: z.boolean().describe("true to turn on, false to pause."),
    }),
    async run(input) {
      assertActionOk(await toggleWorkflowAction(input.workflowId, input.enabled), "Could not change the automation.");
      return { workflowId: input.workflowId, enabled: input.enabled };
    },
  }),

  defineMcpTool({
    name: "automations_request_approval",
    title: "Request approval to publish",
    description: "Ask for a second person's approval of the current draft revision (workspaces can require approval before publishing). Needs the revision from automations_get and a draft that passes validation.",
    group: "automations",
    scope: "automations:write",
    permission: "automations:manage",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    input: z.object({
      workflowId: z.string().uuid().describe("Automation id."),
      expectedRevision: z.number().int().positive().describe("draftRevision from automations_get."),
    }),
    async run(input) {
      assertActionOk(await requestWorkflowApprovalAction(input.workflowId, input.expectedRevision), "Could not request approval.");
      return { requested: true, workflowId: input.workflowId };
    },
  }),

  defineMcpTool({
    name: "automations_approve",
    title: "Approve an automation revision",
    description: "Approve a draft revision that is waiting for approval so it can be published. The data layer refuses self-approval where the workspace policy requires a different person.",
    group: "automations",
    scope: "automations:write",
    permission: "automations:manage",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    input: z.object({
      workflowId: z.string().uuid().describe("Automation id."),
      expectedRevision: z.number().int().positive().describe("draftRevision that was reviewed."),
    }),
    async run(input) {
      assertActionOk(await approveWorkflowAction(input.workflowId, input.expectedRevision), "Could not approve the automation.");
      return { approved: true, workflowId: input.workflowId };
    },
  }),

  defineMcpTool({
    name: "automations_rollback",
    title: "Roll an automation back to a version",
    description: "Replace the automation's draft with an earlier published version (numbers from automations_versions_list). The current draft content is overwritten; re-publish afterwards if it should go live.",
    group: "automations",
    scope: "automations:write",
    permission: "automations:manage",
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    input: z.object({
      workflowId: z.string().uuid().describe("Automation id."),
      version: z.number().int().positive().describe("Version number to restore."),
    }),
    async run(input) {
      assertActionOk(await rollbackWorkflowAction(input.workflowId, input.version), "Could not roll back the automation.");
      return { rolledBackTo: input.version, workflowId: input.workflowId };
    },
  }),

  defineMcpTool({
    name: "automations_delete",
    title: "Delete an automation",
    description: "Delete an automation. It stops running and disappears from the list; run history is kept for audit. Confirm with the user first; prefer automations_set_enabled enabled=false to just stop it.",
    group: "automations",
    scope: "automations:write",
    permission: "automations:manage",
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    input: z.object({ workflowId: z.string().uuid().describe("Automation id from automations_list.") }),
    async run(input) {
      assertActionOk(await deleteWorkflowAction(input.workflowId), "Could not delete the automation.");
      return { deleted: true, workflowId: input.workflowId };
    },
  }),

  defineMcpTool({
    name: "automations_workspace_set_enabled",
    title: "Pause or resume all automations",
    description: "Master switch for every automation in the workspace. Pausing needs a short reason that is shown to other admins; resuming clears it. Use during incidents or before bulk data changes.",
    group: "automations",
    scope: "automations:write",
    permission: "automations:manage",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    input: z.object({
      enabled: z.boolean().describe("false pauses all automations, true resumes them."),
      reason: z.string().trim().min(1).max(500).describe("Why (required, max 500 chars)."),
    }),
    async run(input) {
      const result = await setWorkspaceAutomationEnabledAction({ enabled: input.enabled, reason: input.reason });
      assertActionOk(result, "Could not update the workspace switch.");
      return result.policy ?? { enabled: input.enabled };
    },
  }),

  // ----- Run operations -------------------------------------------------------
  defineMcpTool({
    name: "automations_run_retry",
    title: "Retry a failed run",
    description: "Re-queue a failed run from its first retryable step. Steps that already succeeded are not repeated; the retried step may send email or call integrations again.",
    group: "automations",
    scope: "automations:write",
    permission: "automations:manage",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    input: z.object({ runId: z.string().uuid().describe("Failed run id.") }),
    async run(input) {
      assertActionOk(await retryRunAction(input.runId), "Could not retry the run.");
      return { queued: true, runId: input.runId };
    },
  }),

  defineMcpTool({
    name: "automations_run_replay",
    title: "Replay a run from a step",
    description: "Start a new run that replays an earlier run from step index `stepIndex` (see automations_run_get). Replayed steps execute for real and may send email.",
    group: "automations",
    scope: "automations:write",
    permission: "automations:manage",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    input: z.object({
      runId: z.string().uuid().describe("Run to replay."),
      stepIndex: z.number().int().min(0).describe("Step index to start from."),
    }),
    async run(input) {
      const result = await replayRunFromStepAction(input.runId, input.stepIndex);
      assertActionOk(result, "Could not replay the run.");
      return { queued: true, newRunId: result.runId ?? null, replayOfRunId: input.runId };
    },
  }),

  defineMcpTool({
    name: "automations_run_cancel",
    title: "Cancel a run",
    description: "Request cancellation of a running or waiting run. Steps already executed are not undone.",
    group: "automations",
    scope: "automations:write",
    permission: "automations:manage",
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    input: z.object({ runId: z.string().uuid().describe("Run id.") }),
    async run(input) {
      assertActionOk(await cancelRunAction(input.runId), "Could not cancel the run.");
      return { cancelRequested: true, runId: input.runId };
    },
  }),

  defineMcpTool({
    name: "automations_run_resolve_approval",
    title: "Approve or reject a run's approval step",
    description: "Record your decision on an approval node of a waiting run (see automations_approvals_list). Rejecting sends the run down its rejected path, which can notify or reject candidates.",
    group: "automations",
    scope: "automations:write",
    permission: "automations:manage",
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    input: z.object({
      runId: z.string().uuid().describe("Run id."),
      nodeId: z.string().min(1).max(80).optional().describe("Approval node id (needed when a run has several)."),
      decision: z.enum(["approved", "rejected"]).describe("Your decision."),
    }),
    async run(input) {
      assertActionOk(await resolveRunApprovalAction(input), "Could not record the decision.");
      return { recorded: true, runId: input.runId, decision: input.decision };
    },
  }),
];

/** Synchronous variant of guarded() for pure compile steps. */
function guardedSync<T>(fn: () => T, fallback: string): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof McpToolError) throw error;
    throw new McpToolError(error instanceof Error && error.message ? error.message : fallback, "invalid_input");
  }
}
