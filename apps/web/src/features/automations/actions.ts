"use server";

import { revalidatePath } from "next/cache";

import { ApiError } from "@harly/api";

import {
  createWorkflow,
  approveWorkflow,
  deleteWorkflow,
  getRun,
  getWorkflowMetrics,
  getWorkspaceAutomationPolicy,
  getWorkflow,
  listRunSteps,
  listRuns,
  listWorkflowVersions,
  pauseWorkflow,
  publishWorkflow,
  requestWorkflowApproval,
  resumeWorkflow,
  rollbackWorkflow,
  requestCancelRun,
  replayRunFromStep,
  retryRun,
  listWorkflows,
  listPendingWorkflowApprovals,
  serializeRun,
  serializeRunStep,
  serializeWorkflow,
  serializeWorkflowVersion,
  setWorkspaceAutomationEnabled,
  updateWorkflow,
} from "./data";
import {
  workflowInputSchema,
  type Action,
  type Trigger,
  type WorkflowDefinitionInput,
} from "./schema";
import {
  dryRunWorkflow,
  previewWorkflowPayload,
  searchBuilderOptions,
  type DryRunResult,
  type DryRunScenario,
} from "./builder-data";
import {
  jsonValueSchema,
  type WorkflowGraphV2,
  type JsonValue,
} from "./definition/schema-v2";
import type { NodeOutcome } from "./runtime/advance";
import type {
  BuilderSearchItem,
  BuilderSearchKind,
} from "./builder/search-kinds";
import { getActionHandler, getAutomationTool } from "./registry";
import {
  createWorkflowWebhookEndpoint,
  listWorkflowWebhookEndpoints,
  setWorkflowWebhookEndpointPayloadSchema,
  setWorkflowWebhookEndpointEnabled,
} from "./webhook-ingress";
import {
  reassignWorkflowApproval,
  resolveWorkflowApproval,
  resolveWorkflowUncertain,
} from "./runtime/worker";
import {
  validateGraphForPublish,
  validateWorkflowForPublish,
  type WorkflowValidationIssue,
} from "./publish-validation";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { createLogger } from "@/lib/logger";
import { logAuditEvent } from "@/lib/audit-log";
import { AUTOMATIONS_DISABLED_MESSAGE, AUTOMATIONS_ENABLED } from "./status";
import { assertNotDemo } from "@/features/demo/assert-not-demo";

const log = createLogger("automations");

/**
 * Server actions for the automations dashboard (§3.2). Each is gated by
 * `automations:manage` (added to PERMISSIONS in FASE 0) and resolves the
 * workspace from the session via requirePermission. Input is validated with
 * the shared Zod schemas before reaching the data layer.
 */

const AUTOMATIONS_PATH = "/dashboard/automations";

export async function setWorkspaceAutomationEnabledAction(input: {
  enabled: boolean;
  reason: string;
}): Promise<AutomationsActionResult & {
  policy?: Awaited<ReturnType<typeof getWorkspaceAutomationPolicy>>;
}> {
  try {
    const { organization, user } = await requireAutomationsMutationPermission();
    const policy = await setWorkspaceAutomationEnabled({
      workspaceId: organization.id,
      actorId: user.id,
      enabled: input.enabled,
      reason: input.reason,
    });
    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      action: input.enabled
        ? "automation.workspace_resumed"
        : "automation.workspace_paused",
      resourceType: "workspace_automation_policy",
      resourceId: organization.id,
      metadata: { reason: input.reason.trim() },
    });
    revalidatePath(AUTOMATIONS_PATH);
    return { ok: true, policy };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "Could not update workspace automations."),
    };
  }
}

function serializeWebhookEndpoint(endpoint: {
  id: string;
  workflowId: string;
  name: string;
  enabled: boolean;
  lastReceivedAt: Date | null;
  payloadSchema: Record<string, unknown>;
  endpointUrl?: string;
}) {
  return {
    ...endpoint,
    lastReceivedAt: endpoint.lastReceivedAt?.toISOString() ?? null,
  };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function issuesFromError(
  error: unknown,
): WorkflowValidationIssue[] | undefined {
  if (error instanceof ApiError && Array.isArray(error.details)) {
    return error.details as WorkflowValidationIssue[];
  }
  return undefined;
}

export type AutomationsActionResult = {
  ok: boolean;
  error?: string;
  issues?: WorkflowValidationIssue[];
  conflict?: boolean;
};

function publishBlockersFor(workflow: {
  name: string;
  trigger: unknown;
  actions: unknown;
  engineVersion?: number;
  graph?: WorkflowGraphV2;
}): WorkflowValidationIssue[] {
  if (workflow.engineVersion === 2 && workflow.graph) {
    return validateGraphForPublish(
      { name: workflow.name, graph: workflow.graph },
      getAutomationTool,
    );
  }
  return validateWorkflowForPublish(
    {
      name: workflow.name,
      trigger: workflow.trigger as Trigger,
      actions: workflow.actions as Action[],
    },
    getActionHandler,
  );
}

function assertAutomationsEnabled() {
  if (!AUTOMATIONS_ENABLED) throw new Error(AUTOMATIONS_DISABLED_MESSAGE);
}

async function requireAutomationsPermission() {
  assertAutomationsEnabled();
  return requirePermission("automations:manage");
}

async function requireAutomationsMutationPermission() {
  assertNotDemo();
  return requireAutomationsPermission();
}

// ----- Reads (the list page + builder + run history) -----------------------

export async function listWorkflowsAction() {
  try {
    const { organization } = await requireAutomationsPermission();
    const workflows = await listWorkflows(organization.id);
    return { ok: true, workflows: workflows.map(serializeWorkflow) };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "Could not load automations."),
    };
  }
}

export async function listPendingWorkflowApprovalsAction() {
  try {
    const { organization, user } = await requireAutomationsPermission();
    return {
      ok: true,
      approvals: await listPendingWorkflowApprovals({
        workspaceId: organization.id,
        actorId: user.id,
      }),
    };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "Could not load pending approvals."),
    };
  }
}

export async function getWorkflowAction(id: string) {
  try {
    const { organization } = await requireAutomationsPermission();
    const workflow = await getWorkflow({ workspaceId: organization.id, id });
    return { ok: true, workflow: serializeWorkflow(workflow) };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "Could not load automation."),
    };
  }
}

export async function searchBuilderOptionsAction(input: {
  kind: BuilderSearchKind;
  query?: string;
  id?: string;
  jobId?: string;
  cursor?: string;
}): Promise<{
  ok: boolean;
  error?: string;
  items?: BuilderSearchItem[];
  nextCursor?: string | null;
}> {
  try {
    await requireAutomationsPermission();
    const result = await searchBuilderOptions(input);
    return { ok: true, items: result.items, nextCursor: result.nextCursor };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Could not search.") };
  }
}

export async function listWorkflowVersionsAction(id: string) {
  try {
    const { organization } = await requireAutomationsPermission();
    const versions = await listWorkflowVersions({
      workspaceId: organization.id,
      workflowId: id,
    });
    return { ok: true, versions: versions.map(serializeWorkflowVersion) };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "Could not load workflow history."),
    };
  }
}

export async function getWorkflowMetricsAction(id: string) {
  try {
    const { organization } = await requireAutomationsPermission();
    return {
      ok: true,
      metrics: await getWorkflowMetrics({
        workspaceId: organization.id,
        workflowId: id,
      }),
    };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "Could not load workflow metrics."),
    };
  }
}

export async function listRunsAction(input: {
  workflowId?: string;
  limit?: number;
}) {
  try {
    const { organization } = await requireAutomationsPermission();
    const runs = await listRuns({
      workspaceId: organization.id,
      workflowId: input.workflowId,
      limit: input.limit,
    });
    return { ok: true, runs: runs.map(serializeRun) };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Could not load runs.") };
  }
}

export async function getRunAction(id: string) {
  try {
    const { organization } = await requireAutomationsPermission();
    const run = await getRun({ workspaceId: organization.id, id });
    const steps = await listRunSteps({
      workspaceId: organization.id,
      runId: run.id,
    });
    return {
      ok: true,
      run: serializeRun(run),
      steps: steps.map(serializeRunStep),
    };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Could not load run.") };
  }
}

export async function cancelRunAction(
  id: string,
): Promise<AutomationsActionResult> {
  try {
    const { organization, user } = await requireAutomationsMutationPermission();
    await requestCancelRun({ workspaceId: organization.id, id });
    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      action: "automation.run.cancel_requested",
      resourceType: "workflow_run",
      resourceId: id,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Could not cancel run.") };
  }
}

export async function retryRunAction(
  id: string,
): Promise<AutomationsActionResult> {
  try {
    const { organization, user } = await requireAutomationsMutationPermission();
    await retryRun({ workspaceId: organization.id, id });
    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      action: "automation.run.retry_requested",
      resourceType: "workflow_run",
      resourceId: id,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Could not retry run.") };
  }
}

/** Record a human decision for a running graph approval node. The resolver
 * re-checks membership/eligibility and owns the fenced continuation; this
 * action only supplies the authenticated actor and refreshes the UI. */
export async function resolveRunApprovalAction(input: {
  runId: string;
  nodeId?: string;
  decision: "approved" | "rejected";
}): Promise<AutomationsActionResult> {
  try {
    const { organization, user } = await requireAutomationsMutationPermission();
    const count = await resolveWorkflowApproval({
      workspaceId: organization.id,
      actorId: user.id,
      runId: input.runId,
      nodeId: input.nodeId,
      decision: input.decision,
    });
    if (count === 0)
      return {
        ok: false,
        error: "This approval is not assigned to you or is already resolved.",
      };
    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      action: `automation.run.approval_${input.decision}`,
      resourceType: "workflow_run",
      resourceId: input.runId,
      metadata: { nodeId: input.nodeId },
    });
    revalidatePath(AUTOMATIONS_PATH);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "Could not resolve approval."),
    };
  }
}

export async function reassignRunApprovalAction(input: {
  runId: string;
  nodeId: string;
  actorIds: string[];
}): Promise<AutomationsActionResult> {
  try {
    const { organization, user } = await requireAutomationsMutationPermission();
    const result = await reassignWorkflowApproval({
      workspaceId: organization.id,
      actorId: user.id,
      runId: input.runId,
      nodeId: input.nodeId,
      actorIds: input.actorIds,
    });
    if (!result.ok) return { ok: false, error: result.error };
    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      action: "automation.run.approval_reassigned",
      resourceType: "workflow_run",
      resourceId: input.runId,
      metadata: {
        nodeId: input.nodeId,
        previousActorIds: result.previousActorIds,
        actorIds: result.actorIds,
      },
    });
    revalidatePath(AUTOMATIONS_PATH);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "Could not reassign approval."),
    };
  }
}

export async function resolveRunUncertainAction(input: {
  runId: string;
  nodeId: string;
  decision: "succeeded" | "failed";
  note: string;
  providerRef?: string;
  outputJson?: string;
}): Promise<AutomationsActionResult> {
  try {
    const { organization, user } = await requireAutomationsMutationPermission();
    let output: JsonValue | undefined;
    if (input.outputJson?.trim()) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(input.outputJson);
      } catch {
        return {
          ok: false,
          error: "The reconciliation output is not valid JSON.",
        };
      }
      const checked = jsonValueSchema.safeParse(parsed);
      if (!checked.success)
        return {
          ok: false,
          error: "The reconciliation output must be valid JSON.",
        };
      output = checked.data;
    }
    const result = await resolveWorkflowUncertain({
      workspaceId: organization.id,
      runId: input.runId,
      nodeId: input.nodeId,
      decision: input.decision,
      note: input.note,
      providerRef: input.providerRef,
      output,
    });
    if (!result.ok) return { ok: false, error: result.error };
    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      action: `automation.run.uncertain_${input.decision}`,
      resourceType: "workflow_run",
      resourceId: input.runId,
      metadata: {
        nodeId: input.nodeId,
        providerRef: input.providerRef,
        note: input.note,
        resumedStatus: result.resumedStatus,
      },
    });
    revalidatePath(AUTOMATIONS_PATH);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "Could not reconcile uncertain action."),
    };
  }
}

export async function replayRunFromStepAction(
  id: string,
  stepIndex: number,
): Promise<AutomationsActionResult & { runId?: string }> {
  try {
    const { organization, user } = await requireAutomationsMutationPermission();
    const run = await replayRunFromStep({
      workspaceId: organization.id,
      id,
      stepIndex,
    });
    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      action: "automation.run.replayed",
      resourceType: "workflow_run",
      resourceId: id,
      metadata: { replayRunId: run.id, stepIndex },
    });
    return { ok: true, runId: run.id };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Could not replay run.") };
  }
}

export async function requestWorkflowApprovalAction(
  id: string,
  expectedRevision: number,
): Promise<AutomationsActionResult> {
  try {
    const { organization, user } = await requireAutomationsMutationPermission();
    const current = await getWorkflow({ workspaceId: organization.id, id });
    if (current.draftRevision !== expectedRevision) {
      return {
        ok: false,
        conflict: true,
        error: "This draft changed. Save the latest revision and try again.",
      };
    }
    const issues = publishBlockersFor(current);
    if (issues.length > 0) {
      return {
        ok: false,
        error: issues[0]?.message ?? "This recipe isn't ready to publish.",
        issues,
      };
    }
    await requestWorkflowApproval({
      workspaceId: organization.id,
      id,
      requesterId: user.id,
      expectedRevision,
    });
    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      action: "automation.approval_requested",
      resourceType: "workflow",
      resourceId: id,
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "Could not request approval."),
      issues: issuesFromError(error),
      conflict: error instanceof ApiError && error.code === "conflict",
    };
  }
}

export async function approveWorkflowAction(
  id: string,
  expectedRevision: number,
): Promise<AutomationsActionResult> {
  try {
    const { organization, user } = await requireAutomationsMutationPermission();
    await approveWorkflow({
      workspaceId: organization.id,
      id,
      approverId: user.id,
      expectedRevision,
    });
    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      action: "automation.approved",
      resourceType: "workflow",
      resourceId: id,
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "Could not approve workflow."),
      conflict: error instanceof ApiError && error.code === "conflict",
    };
  }
}

export async function publishWorkflowAction(
  id: string,
  expectedRevision: number,
): Promise<AutomationsActionResult> {
  try {
    const { organization, user } = await requireAutomationsMutationPermission();
    const current = await getWorkflow({ workspaceId: organization.id, id });
    if (current.draftRevision !== expectedRevision) {
      return {
        ok: false,
        conflict: true,
        error: "This draft changed. Save the latest revision and try again.",
      };
    }
    const issues = publishBlockersFor(current);
    if (issues.length > 0) {
      return {
        ok: false,
        error: issues[0]?.message ?? "This recipe isn't ready to publish.",
        issues,
      };
    }
    await publishWorkflow({
      workspaceId: organization.id,
      id,
      publisherId: user.id,
      expectedRevision,
    });
    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      action: "automation.published",
      resourceType: "workflow",
      resourceId: id,
    });
    revalidatePath(AUTOMATIONS_PATH);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "Could not publish workflow."),
      issues: issuesFromError(error),
      conflict: error instanceof ApiError && error.code === "conflict",
    };
  }
}

export async function pauseWorkflowAction(
  id: string,
): Promise<AutomationsActionResult> {
  try {
    const { organization, user } = await requireAutomationsMutationPermission();
    await pauseWorkflow({ workspaceId: organization.id, id });
    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      action: "automation.paused",
      resourceType: "workflow",
      resourceId: id,
    });
    revalidatePath(AUTOMATIONS_PATH);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "Could not pause workflow."),
    };
  }
}

export async function resumeWorkflowAction(
  id: string,
): Promise<AutomationsActionResult> {
  try {
    const { organization, user } = await requireAutomationsMutationPermission();
    await resumeWorkflow({ workspaceId: organization.id, id });
    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      action: "automation.resumed",
      resourceType: "workflow",
      resourceId: id,
    });
    revalidatePath(AUTOMATIONS_PATH);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "Could not resume workflow."),
    };
  }
}

export async function rollbackWorkflowAction(
  id: string,
  version: number,
): Promise<AutomationsActionResult> {
  try {
    const { organization, user } = await requireAutomationsMutationPermission();
    await rollbackWorkflow({
      workspaceId: organization.id,
      workflowId: id,
      version,
    });
    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      action: "automation.rolled_back",
      resourceType: "workflow",
      resourceId: id,
      metadata: { version },
    });
    revalidatePath(AUTOMATIONS_PATH);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "Could not roll back workflow."),
    };
  }
}

// ----- Writes (create / update / delete / toggle) --------------------------

export async function createWorkflowAction(
  values: WorkflowDefinitionInput,
  extras?: {
    graph?: import("./definition/schema-v2").WorkflowGraphV2;
    layout?: import("./definition/schema-v2").EditorLayout;
  },
): Promise<
  AutomationsActionResult & { workflow?: ReturnType<typeof serializeWorkflow> }
> {
  try {
    const { organization, user } = await requireAutomationsMutationPermission();
    const parsed = workflowInputSchema.parse(values);
    const workflow = await createWorkflow({
      workspaceId: organization.id,
      values: parsed,
      createdById: user.id,
      graph: extras?.graph,
      layout: extras?.layout,
    });
    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      action: "automation.created",
      resourceType: "workflow",
      resourceId: workflow.id,
      metadata: {
        version: workflow.definitionVersion,
        triggerEvent: workflow.triggerEvent,
      },
    });
    revalidatePath(AUTOMATIONS_PATH);
    return { ok: true, workflow: serializeWorkflow(workflow) };
  } catch (error) {
    log.error(error, "[automations] createWorkflowAction failed");
    return {
      ok: false,
      error: errorMessage(error, "Could not create automation."),
    };
  }
}

export async function updateWorkflowAction(
  id: string,
  patch: Partial<WorkflowDefinitionInput>,
  expectedRevision?: number,
  extras?: {
    graph?: import("./definition/schema-v2").WorkflowGraphV2;
    layout?: import("./definition/schema-v2").EditorLayout;
  },
): Promise<
  AutomationsActionResult & { workflow?: ReturnType<typeof serializeWorkflow> }
> {
  let organization: { id: string };
  let user: { id: string };
  try {
    const session = await requireAutomationsMutationPermission();
    organization = session.organization;
    user = session.user;
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "Could not update automation."),
    };
  }
  try {
    const workflow = await updateWorkflow({
      workspaceId: organization.id,
      id,
      patch,
      expectedRevision,
      actorId: user.id,
      graph: extras?.graph,
      layout: extras?.layout,
    });
    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      action: "automation.updated",
      resourceType: "workflow",
      resourceId: workflow.id,
      metadata: { version: workflow.definitionVersion },
    });
    if (workflow.operationalPolicyRelaxed) {
      await logAuditEvent({
        workspaceId: organization.id,
        actorId: user.id,
        action: "automation.operational_policy_relaxed",
        resourceType: "workflow",
        resourceId: workflow.id,
        severity: "warning",
        metadata: {
          maxRunsPerMinute: workflow.maxRunsPerMinute,
          maxExternalActionsPerMinute: workflow.maxExternalActionsPerMinute,
          circuitBreakerThreshold: workflow.circuitBreakerThreshold,
          circuitBreakerCooldownSeconds: workflow.circuitBreakerCooldownSeconds,
          circuitOpenUntil: workflow.circuitOpenUntil?.toISOString() ?? null,
          reviewRequired: true,
        },
      });
    }
    revalidatePath(AUTOMATIONS_PATH);
    return { ok: true, workflow: serializeWorkflow(workflow) };
  } catch (error) {
    log.error(error, "[automations] updateWorkflowAction failed");
    if (error instanceof ApiError && error.code === "conflict") {
      try {
        const current = await getWorkflow({ workspaceId: organization.id, id });
        return {
          ok: false,
          conflict: true,
          error: errorMessage(error, "This draft was saved elsewhere."),
          workflow: serializeWorkflow(current),
        };
      } catch {
        return {
          ok: false,
          conflict: true,
          error: errorMessage(error, "This draft was saved elsewhere."),
        };
      }
    }
    return {
      ok: false,
      error: errorMessage(error, "Could not update automation."),
    };
  }
}

/** Convenience: flip the enabled flag without re-sending the whole definition. */
export async function toggleWorkflowAction(
  id: string,
  enabled: boolean,
): Promise<AutomationsActionResult> {
  try {
    const { organization, user } = await requireAutomationsMutationPermission();
    if (enabled) {
      const workflow = await getWorkflow({ workspaceId: organization.id, id });
      if (workflow.status === "paused") {
        await resumeWorkflow({ workspaceId: organization.id, id });
      } else {
        await publishWorkflow({
          workspaceId: organization.id,
          id,
          publisherId: user.id,
          expectedRevision: workflow.draftRevision,
        });
      }
    } else {
      await pauseWorkflow({ workspaceId: organization.id, id });
    }
    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      action: enabled ? "automation.enabled" : "automation.disabled",
      resourceType: "workflow",
      resourceId: id,
    });
    revalidatePath(AUTOMATIONS_PATH);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "Could not toggle automation."),
    };
  }
}

export async function listWorkflowWebhookEndpointsAction(workflowId: string) {
  try {
    const { organization } = await requireAutomationsPermission();
    return {
      ok: true as const,
      endpoints: (
        await listWorkflowWebhookEndpoints({
          workspaceId: organization.id,
          workflowId,
        })
      ).map(serializeWebhookEndpoint),
    };
  } catch (error) {
    return {
      ok: false as const,
      error: errorMessage(error, "Could not load webhook endpoints."),
    };
  }
}

/** Create an inbound endpoint. The secret is returned once and never listed. */
export async function createWorkflowWebhookEndpointAction(input: {
  workflowId: string;
  name: string;
  payloadSchema?: Record<string, unknown>;
}) {
  try {
    const { organization, user } = await requireAutomationsMutationPermission();
    const result = await createWorkflowWebhookEndpoint({
      workspaceId: organization.id,
      workflowId: input.workflowId,
      actorId: user.id,
      name: input.name,
      payloadSchema: input.payloadSchema,
    });
    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      action: "automation.webhook_endpoint.created",
      resourceType: "workflow",
      resourceId: input.workflowId,
      metadata: { endpointId: result.endpoint.id },
    });
    return {
      ok: true as const,
      endpoint: serializeWebhookEndpoint(result.endpoint),
      endpointUrl: result.endpoint.endpointUrl,
      secret: result.secret,
    };
  } catch (error) {
    return {
      ok: false as const,
      error: errorMessage(error, "Could not create webhook endpoint."),
    };
  }
}

export async function toggleWorkflowWebhookEndpointAction(input: {
  endpointId: string;
  enabled: boolean;
}) {
  try {
    const { organization, user } = await requireAutomationsMutationPermission();
    const updated = await setWorkflowWebhookEndpointEnabled({
      workspaceId: organization.id,
      endpointId: input.endpointId,
      enabled: input.enabled,
    });
    if (!updated)
      return { ok: false as const, error: "Webhook endpoint not found." };
    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      action: `automation.webhook_endpoint.${input.enabled ? "enabled" : "disabled"}`,
      resourceType: "workflow_webhook_endpoint",
      resourceId: input.endpointId,
    });
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: errorMessage(error, "Could not update webhook endpoint."),
    };
  }
}

export async function updateWorkflowWebhookEndpointPayloadSchemaAction(input: {
  endpointId: string;
  payloadSchema: unknown;
}) {
  try {
    const { organization, user } = await requireAutomationsMutationPermission();
    const updated = await setWorkflowWebhookEndpointPayloadSchema({
      workspaceId: organization.id,
      endpointId: input.endpointId,
      payloadSchema: input.payloadSchema,
    });
    if (!updated)
      return { ok: false as const, error: "Webhook endpoint not found." };
    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      action: "automation.webhook_endpoint.schema_updated",
      resourceType: "workflow_webhook_endpoint",
      resourceId: input.endpointId,
    });
    revalidatePath(AUTOMATIONS_PATH);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: errorMessage(
        error,
        "Could not update the webhook payload schema.",
      ),
    };
  }
}

export async function deleteWorkflowAction(
  id: string,
): Promise<AutomationsActionResult> {
  try {
    const { organization, user } = await requireAutomationsMutationPermission();
    await deleteWorkflow({ workspaceId: organization.id, id });
    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      action: "automation.deleted",
      resourceType: "workflow",
      resourceId: id,
      severity: "warning",
    });
    revalidatePath(AUTOMATIONS_PATH);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "Could not delete automation."),
    };
  }
}

// ----- Builder support: dry-run + from-template ----------------------------

/**
 * Dry-run (T5): evaluate a *draft* condition tree against a sample candidate
 * without persisting or running anything. The builder's "Test" button calls
 * this so a recruiter can preview a match before saving. Gated by
 * automations:manage (you must be able to edit to test-drive).
 */
export async function dryRunWorkflowAction(input: {
  graph: WorkflowGraphV2;
  workflowId?: string;
  candidateId?: string;
  webhookPayload?: unknown;
  scenario?: DryRunScenario;
  fixtures?: Record<string, NodeOutcome>;
  startedAt?: string;
}): Promise<AutomationsActionResult & Partial<DryRunResult>> {
  try {
    await requireAutomationsMutationPermission();
    const result = await dryRunWorkflow(input);
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Could not run dry-run.") };
  }
}

export async function previewWorkflowPayloadAction(input: {
  trigger: WorkflowDefinitionInput["trigger"];
  candidateId?: string;
}): Promise<AutomationsActionResult & { payload?: Record<string, unknown> }> {
  try {
    await requireAutomationsMutationPermission();
    return { ok: true, payload: await previewWorkflowPayload(input) };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "Could not preview payload."),
    };
  }
}

/**
 * Create a workflow from a prebuilt template (FASE 4). The template supplies a
 * full WorkflowDefinitionInput; we validate it with the shared Zod schema
 * before persisting (never trust a constant blindly — the catalog is code, but
 * the contract is the schema). Gated by automations:manage.
 */
export async function createWorkflowFromTemplateAction(
  values: WorkflowDefinitionInput,
): Promise<
  AutomationsActionResult & { workflow?: ReturnType<typeof serializeWorkflow> }
> {
  try {
    const { organization, user } = await requireAutomationsMutationPermission();
    const parsed = workflowInputSchema.parse(values);
    const workflow = await createWorkflow({
      workspaceId: organization.id,
      values: parsed,
      createdById: user.id,
    });
    revalidatePath(AUTOMATIONS_PATH);
    return { ok: true, workflow: serializeWorkflow(workflow) };
  } catch (error) {
    log.error(error, "[automations] createWorkflowFromTemplateAction failed");
    return {
      ok: false,
      error: errorMessage(error, "Could not create from template."),
    };
  }
}
