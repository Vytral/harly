"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ApiError } from "@harly/api";
import {
  jobStageArchiveSchema,
  jobStageCreateSchema,
  jobStageReorderSchema,
  jobStageUpdateSchema,
} from "@harly/validators";

import { createLogger } from "@/lib/logger";
import { requireJobPermission } from "@/features/workspaces/permissions-server";

import {
  archiveStage,
  createStage,
  deleteStage,
  listJobStages,
  parseStageEmailConfig,
  reorderStages,
  updateStage,
} from "./stage-lifecycle";

/**
 * Server actions behind the stage editor and pipeline board. They enforce
 * job-scoped `jobs:edit` (or `jobs:view` for reads) and return a result object
 * instead of throwing, so the client can show the message. Only async function
 * exports are allowed in this file; shared types live in stage-lifecycle.ts.
 */

const log = createLogger("pipeline");

const jobIdSchema = z.uuid();

const createInputSchema = jobStageCreateSchema.extend({ jobId: jobIdSchema });
const updateInputSchema = jobStageUpdateSchema.extend({
  jobId: jobIdSchema,
  stageId: z.uuid(),
});
const reorderInputSchema = jobStageReorderSchema.extend({ jobId: jobIdSchema });
const archiveInputSchema = jobStageArchiveSchema.extend({
  jobId: jobIdSchema,
  stageId: z.uuid(),
});
const deleteInputSchema = z.object({ jobId: jobIdSchema, stageId: z.uuid() });
const listInputSchema = z.object({
  jobId: jobIdSchema,
  includeArchived: z.boolean().optional(),
});

type ActionFailure = { success: false; error: string };

function isNextControlFlowError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_")
  );
}

function invalidInput(error: z.ZodError): ActionFailure {
  const issue = error.issues[0];
  const field = issue?.path.join(".") || "input";
  return { success: false, error: `Invalid ${field}: ${issue?.message ?? "invalid value"}.` };
}

/**
 * Authorize, run the lifecycle operation and revalidate the pipeline pages.
 * Redirects and not-found signals from Next pass through untouched; every
 * other failure becomes a result, and unexpected ones are logged.
 */
async function runStageAction<T extends object>(
  action: string,
  jobId: string,
  permission: "jobs:edit" | "jobs:view",
  work: (scope: { workspaceId: string; jobId: string; actorUserId: string }) => Promise<T>,
): Promise<({ success: true } & T) | ActionFailure> {
  let context: Awaited<ReturnType<typeof requireJobPermission>>;
  try {
    context = await requireJobPermission(permission, jobId);
  } catch (error) {
    if (isNextControlFlowError(error)) throw error;
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "You do not have permission to change this job's pipeline.",
    };
  }

  try {
    const payload = await work({
      workspaceId: context.organization.id,
      jobId,
      actorUserId: context.user.id,
    });
    if (permission === "jobs:edit") {
      revalidatePath(`/dashboard/jobs/${jobId}`);
      revalidatePath("/dashboard/pipeline");
    }
    return { success: true, ...payload };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message };
    }
    if (isNextControlFlowError(error)) throw error;
    log.error({ err: error, action, jobId }, "stage action failed");
    return { success: false, error: "The pipeline could not be updated. Try again." };
  }
}

export async function listJobStagesAction(input: {
  jobId: string;
  includeArchived?: boolean;
}) {
  const parsed = listInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  return runStageAction(
    "listJobStages",
    parsed.data.jobId,
    "jobs:view",
    async (scope) => ({
      stages: await listJobStages({
        workspaceId: scope.workspaceId,
        jobId: scope.jobId,
        includeArchived: parsed.data.includeArchived ?? false,
      }),
    }),
  );
}

export async function createJobStageAction(input: {
  jobId: string;
  name: string;
  color?: string | null;
  kind?: z.infer<typeof jobStageCreateSchema>["kind"];
  position?: number;
}) {
  const parsed = createInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  const values = parsed.data;
  return runStageAction("createJobStage", values.jobId, "jobs:edit", async (scope) => ({
    stage: await createStage({
      ...scope,
      name: values.name,
      color: values.color,
      kind: values.kind,
      position: values.position,
    }),
  }));
}

export async function updateJobStageAction(input: {
  jobId: string;
  stageId: string;
  name?: string;
  color?: string | null;
  kind?: z.infer<typeof jobStageUpdateSchema>["kind"];
  emailConfig?: { candidateUpdatesEnabled: boolean };
}) {
  const parsed = updateInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  const values = parsed.data;
  return runStageAction("updateJobStage", values.jobId, "jobs:edit", async (scope) => ({
    stage: await updateStage({
      ...scope,
      stageId: values.stageId,
      patch: {
        name: values.name,
        color: values.color,
        kind: values.kind,
        emailConfig: parseStageEmailConfig(values.emailConfig),
      },
    }),
  }));
}

export async function reorderJobStagesAction(input: {
  jobId: string;
  stageIds: string[];
}) {
  const parsed = reorderInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  const values = parsed.data;
  return runStageAction("reorderJobStages", values.jobId, "jobs:edit", async (scope) => ({
    stages: await reorderStages({ ...scope, orderedStageIds: values.stageIds }),
  }));
}

export async function archiveJobStageAction(input: {
  jobId: string;
  stageId: string;
  mergeIntoStageId?: string | null;
}) {
  const parsed = archiveInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  const values = parsed.data;
  return runStageAction("archiveJobStage", values.jobId, "jobs:edit", async (scope) => {
    const result = await archiveStage({
      ...scope,
      stageId: values.stageId,
      mergeIntoStageId: values.mergeIntoStageId ?? null,
    });
    return { stage: result.stage, movedApplications: result.movedApplications };
  });
}

export async function deleteJobStageAction(input: { jobId: string; stageId: string }) {
  const parsed = deleteInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  const values = parsed.data;
  return runStageAction("deleteJobStage", values.jobId, "jobs:edit", async (scope) => {
    await deleteStage({ ...scope, stageId: values.stageId });
    return {};
  });
}
