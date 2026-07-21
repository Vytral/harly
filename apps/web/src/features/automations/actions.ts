"use server";

import { revalidatePath } from "next/cache";

import {
  createWorkflow,
  deleteWorkflow,
  getRun,
  getWorkflow,
  listRunSteps,
  listRuns,
  listWorkflows,
  serializeRun,
  serializeRunStep,
  serializeWorkflow,
  updateWorkflow,
} from "./data";
import { workflowInputSchema, type WorkflowDefinitionInput } from "./schema";
import { dryRunWorkflow } from "./builder-data";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { createLogger } from "@/lib/logger";

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

// ----- Reads (the list page + builder + run history) -----------------------

export async function listWorkflowsAction() {
  try {
    const { organization } = await requirePermission("automations:manage");
    const workflows = await listWorkflows(organization.id);
    return { ok: true, workflows: workflows.map(serializeWorkflow) };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Could not load automations.") };
  }
}

export async function getWorkflowAction(id: string) {
  try {
    const { organization } = await requirePermission("automations:manage");
    const workflow = await getWorkflow({ workspaceId: organization.id, id });
    return { ok: true, workflow: serializeWorkflow(workflow) };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Could not load automation.") };
  }
}

export async function listRunsAction(input: { workflowId?: string; limit?: number }) {
  try {
    const { organization } = await requirePermission("automations:manage");
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
    const { organization } = await requirePermission("automations:manage");
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

// ----- Writes (create / update / delete / toggle) --------------------------

export async function createWorkflowAction(
  values: WorkflowDefinitionInput,
): Promise<AutomationsActionResult & { workflow?: ReturnType<typeof serializeWorkflow> }> {
  try {
    const { organization, user } = await requirePermission("automations:manage");
    const parsed = workflowInputSchema.parse(values);
    const workflow = await createWorkflow({
      workspaceId: organization.id,
      values: parsed,
      createdById: user.id,
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
    const { organization } = await requirePermission("automations:manage");
    const workflow = await updateWorkflow({
      workspaceId: organization.id,
      id,
      patch,
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
    const { organization } = await requirePermission("automations:manage");
    await updateWorkflow({
      workspaceId: organization.id,
      id,
      patch: { enabled },
    });
    revalidatePath(AUTOMATIONS_PATH);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Could not toggle automation.") };
  }
}

export async function deleteWorkflowAction(id: string): Promise<AutomationsActionResult> {
  try {
    const { organization } = await requirePermission("automations:manage");
    await deleteWorkflow({ workspaceId: organization.id, id });
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
    await requirePermission("automations:manage");
    const result = await dryRunWorkflow(input);
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Could not run dry-run.") };
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
    const { organization, user } = await requirePermission("automations:manage");
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
