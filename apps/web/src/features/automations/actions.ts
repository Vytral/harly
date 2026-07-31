"use server";

import { revalidatePath } from "next/cache";

import {
  createWorkflow,
  approveWorkflow,
  deleteWorkflow,
  getRun,
  getWorkflowMetrics,
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
  serializeRun,
  serializeRunStep,
  serializeWorkflow,
  serializeWorkflowVersion,
  updateWorkflow,
} from "./data";
import { workflowInputSchema, type WorkflowDefinitionInput } from "./schema";
import { dryRunWorkflow, previewWorkflowPayload } from "./builder-data";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { createLogger } from "@/lib/logger";
import { logAuditEvent } from "@/lib/audit-log";
import {
  AUTOMATIONS_DISABLED_MESSAGE,
  AUTOMATIONS_ENABLED,
} from "./status";

const log = createLogger("automations");

/**
 * Server actions for the automations dashboard (§3.2). Each is gated by
 * `automations:manage` (added to PERMISSIONS in FASE 0) and resolves the
 * workspace from the session via requirePermission. Input is validated with
 * the shared Zod schemas before reaching the data layer.
 */

const AUTOMATIONS_PATH = "/dashboard/automations";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export type AutomationsActionResult = { ok: boolean; error?: string };

function assertAutomationsEnabled() {
  if (!AUTOMATIONS_ENABLED) throw new Error(AUTOMATIONS_DISABLED_MESSAGE);
}

async function requireAutomationsPermission() {
  assertAutomationsEnabled();
  return requirePermission("automations:manage");
}

// ----- Reads (the list page + builder + run history) -----------------------

export async function listWorkflowsAction() {
  try {
    const { organization } = await requireAutomationsPermission();
    const workflows = await listWorkflows(organization.id);
    return { ok: true, workflows: workflows.map(serializeWorkflow) };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Could not load automations.") };
  }
}

export async function getWorkflowAction(id: string) {
  try {
    const { organization } = await requireAutomationsPermission();
    const workflow = await getWorkflow({ workspaceId: organization.id, id });
    return { ok: true, workflow: serializeWorkflow(workflow) };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Could not load automation.") };
  }
}

export async function listWorkflowVersionsAction(id: string) {
  try {
    const { organization } = await requireAutomationsPermission();
    const versions = await listWorkflowVersions({ workspaceId: organization.id, workflowId: id });
    return { ok: true, versions: versions.map(serializeWorkflowVersion) };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Could not load workflow history.") };
  }
}

export async function getWorkflowMetricsAction(id: string) {
  try {
    const { organization } = await requireAutomationsPermission();
    return { ok: true, metrics: await getWorkflowMetrics({ workspaceId: organization.id, workflowId: id }) };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Could not load workflow metrics.") };
  }
}

export async function listRunsAction(input: { workflowId?: string; limit?: number }) {
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

export async function cancelRunAction(id: string): Promise<AutomationsActionResult> {
  try {
    const { organization, user } = await requireAutomationsPermission();
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

export async function retryRunAction(id: string): Promise<AutomationsActionResult> {
  try {
    const { organization, user } = await requireAutomationsPermission();
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

export async function replayRunFromStepAction(id: string, stepIndex: number): Promise<AutomationsActionResult & { runId?: string }> {
  try {
    const { organization, user } = await requireAutomationsPermission();
    const run = await replayRunFromStep({ workspaceId: organization.id, id, stepIndex });
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

export async function requestWorkflowApprovalAction(id: string): Promise<AutomationsActionResult> {
  try {
    const { organization, user } = await requireAutomationsPermission();
    await requestWorkflowApproval({ workspaceId: organization.id, id });
    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      action: "automation.approval_requested",
      resourceType: "workflow",
      resourceId: id,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Could not request approval.") };
  }
}

export async function approveWorkflowAction(id: string): Promise<AutomationsActionResult> {
  try {
    const { organization, user } = await requireAutomationsPermission();
    await approveWorkflow({ workspaceId: organization.id, id, approverId: user.id });
    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      action: "automation.approved",
      resourceType: "workflow",
      resourceId: id,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Could not approve workflow.") };
  }
}

export async function publishWorkflowAction(id: string): Promise<AutomationsActionResult> {
  try {
    const { organization, user } = await requireAutomationsPermission();
    await publishWorkflow({ workspaceId: organization.id, id, publisherId: user.id });
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
    return { ok: false, error: errorMessage(error, "Could not publish workflow.") };
  }
}

export async function pauseWorkflowAction(id: string): Promise<AutomationsActionResult> {
  try {
    const { organization, user } = await requireAutomationsPermission();
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
    return { ok: false, error: errorMessage(error, "Could not pause workflow.") };
  }
}

export async function resumeWorkflowAction(id: string): Promise<AutomationsActionResult> {
  try {
    const { organization, user } = await requireAutomationsPermission();
    await resumeWorkflow({ workspaceId: organization.id, id });
    await logAuditEvent({ workspaceId: organization.id, actorId: user.id, action: "automation.resumed", resourceType: "workflow", resourceId: id });
    revalidatePath(AUTOMATIONS_PATH);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Could not resume workflow.") };
  }
}

export async function rollbackWorkflowAction(id: string, version: number): Promise<AutomationsActionResult> {
  try {
    const { organization, user } = await requireAutomationsPermission();
    await rollbackWorkflow({ workspaceId: organization.id, workflowId: id, version });
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
    return { ok: false, error: errorMessage(error, "Could not roll back workflow.") };
  }
}

// ----- Writes (create / update / delete / toggle) --------------------------

export async function createWorkflowAction(
  values: WorkflowDefinitionInput,
): Promise<AutomationsActionResult & { workflow?: ReturnType<typeof serializeWorkflow> }> {
  try {
    const { organization, user } = await requireAutomationsPermission();
    const parsed = workflowInputSchema.parse(values);
    const workflow = await createWorkflow({
      workspaceId: organization.id,
      values: parsed,
      createdById: user.id,
    });
    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      action: "automation.created",
      resourceType: "workflow",
      resourceId: workflow.id,
      metadata: { version: workflow.definitionVersion, triggerEvent: workflow.triggerEvent },
    });
    revalidatePath(AUTOMATIONS_PATH);
    return { ok: true, workflow: serializeWorkflow(workflow) };
  } catch (error) {
    log.error(error, "[automations] createWorkflowAction failed");
    return { ok: false, error: errorMessage(error, "Could not create automation.") };
  }
}

export async function updateWorkflowAction(
  id: string,
  patch: Partial<WorkflowDefinitionInput>,
): Promise<AutomationsActionResult & { workflow?: ReturnType<typeof serializeWorkflow> }> {
  try {
    const { organization, user } = await requireAutomationsPermission();
    const workflow = await updateWorkflow({
      workspaceId: organization.id,
      id,
      patch,
    });
    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      action: "automation.updated",
      resourceType: "workflow",
      resourceId: workflow.id,
      metadata: { version: workflow.definitionVersion },
    });
    revalidatePath(AUTOMATIONS_PATH);
    return { ok: true, workflow: serializeWorkflow(workflow) };
  } catch (error) {
    log.error(error, "[automations] updateWorkflowAction failed");
    return { ok: false, error: errorMessage(error, "Could not update automation.") };
  }
}

/** Convenience: flip the enabled flag without re-sending the whole definition. */
export async function toggleWorkflowAction(
  id: string,
  enabled: boolean,
): Promise<AutomationsActionResult> {
  try {
    const { organization, user } = await requireAutomationsPermission();
    if (enabled) {
      await publishWorkflow({ workspaceId: organization.id, id, publisherId: user.id });
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
    return { ok: false, error: errorMessage(error, "Could not toggle automation.") };
  }
}

export async function deleteWorkflowAction(id: string): Promise<AutomationsActionResult> {
  try {
    const { organization, user } = await requireAutomationsPermission();
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
    return { ok: false, error: errorMessage(error, "Could not delete automation.") };
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
  trigger: WorkflowDefinitionInput["trigger"];
  conditions?: WorkflowDefinitionInput["conditions"];
  candidateId?: string;
}): Promise<AutomationsActionResult & {
  matched?: boolean;
  evaluated?: Array<{ text: string; matched: boolean }>;
}> {
  try {
    await requireAutomationsPermission();
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
    await requireAutomationsPermission();
    return { ok: true, payload: await previewWorkflowPayload(input) };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Could not preview payload.") };
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
): Promise<AutomationsActionResult & { workflow?: ReturnType<typeof serializeWorkflow> }> {
  try {
    const { organization, user } = await requireAutomationsPermission();
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
    return { ok: false, error: errorMessage(error, "Could not create from template.") };
  }
}
