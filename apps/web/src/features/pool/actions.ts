"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@harly/db";
import {
  applications,
  applicationStageHistory,
  candidates,
  jobs,
  jobStages,
  poolEntries,
} from "@harly/db";
import { requirePermission } from "@/features/workspaces/permissions-server";
import {
  ACTIVE_POOL_ENTRY_CONFLICT_MESSAGE,
  isActivePoolEntryUniqueViolation,
} from "@/features/pool/errors";

export type PoolActionState = { success: boolean; error?: string };

const addToPoolSchema = z.object({
  candidateId: z.string().uuid(),
  source: z.enum(["applied", "imported", "sourced", "referred"]).default("sourced"),
  jobId: z.string().uuid().optional(),
  reason: z.string().max(500).optional(),
});

export async function addToPoolAction(input: {
  candidateId: string;
  source?: "applied" | "imported" | "sourced" | "referred";
  jobId?: string;
  reason?: string;
}): Promise<PoolActionState> {
  const parsed = addToPoolSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input." };

  const { user, organization: workspace } = await requirePermission("candidates:edit");

  // Check if already in pool
  const [existing] = await db
    .select({ id: poolEntries.id })
    .from(poolEntries)
    .where(
      and(
        eq(poolEntries.workspaceId, workspace.id),
        eq(poolEntries.candidateId, parsed.data.candidateId),
        isNull(poolEntries.removedAt),
      ),
    )
    .limit(1);

  if (existing) {
    return { success: false, error: ACTIVE_POOL_ENTRY_CONFLICT_MESSAGE };
  }

  try {
    await db.insert(poolEntries).values({
      workspaceId: workspace.id,
      candidateId: parsed.data.candidateId,
      jobId: parsed.data.jobId ?? null,
      reason: parsed.data.reason ?? null,
      source: parsed.data.source,
      addedById: user.id,
    });
  } catch (error) {
    if (isActivePoolEntryUniqueViolation(error)) {
      return { success: false, error: ACTIVE_POOL_ENTRY_CONFLICT_MESSAGE };
    }
    throw error;
  }

  revalidatePath("/dashboard/talent-pool");
  revalidatePath("/dashboard/candidates");
  return { success: true };
}

const removeFromPoolSchema = z.object({
  candidateId: z.string().uuid(),
});

export async function removeFromPoolAction(input: {
  candidateId: string;
}): Promise<PoolActionState> {
  const parsed = removeFromPoolSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input." };

  const { organization: workspace } = await requirePermission("candidates:edit");

  const [entry] = await db
    .select({ id: poolEntries.id })
    .from(poolEntries)
    .where(
      and(
        eq(poolEntries.workspaceId, workspace.id),
        eq(poolEntries.candidateId, parsed.data.candidateId),
        isNull(poolEntries.removedAt),
      ),
    )
    .limit(1);

  if (!entry) {
    return { success: false, error: "Candidate is not in the pool." };
  }

  await db
    .update(poolEntries)
    .set({ removedAt: new Date() })
    .where(eq(poolEntries.id, entry.id));

  revalidatePath("/dashboard/talent-pool");
  revalidatePath("/dashboard/candidates");
  return { success: true };
}

const bulkRemoveFromPoolSchema = z.object({
  candidateIds: z.array(z.string().uuid()).min(1).max(100),
});

export async function bulkRemoveFromPoolAction(input: {
  candidateIds: string[];
}): Promise<PoolActionState> {
  const parsed = bulkRemoveFromPoolSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid selection." };

  const { organization: workspace } = await requirePermission("candidates:edit");

  // Find active pool entries for these candidates
  const entries = await db
    .select({ id: poolEntries.id, candidateId: poolEntries.candidateId })
    .from(poolEntries)
    .where(
      and(
        eq(poolEntries.workspaceId, workspace.id),
        isNull(poolEntries.removedAt),
      ),
    );

  const entriesToRemove = entries.filter((e) =>
    parsed.data.candidateIds.includes(e.candidateId),
  );

  if (entriesToRemove.length === 0) {
    return { success: false, error: "No candidates found in pool." };
  }

  const now = new Date();
  await Promise.all(
    entriesToRemove.map((e) =>
      db.update(poolEntries).set({ removedAt: now }).where(eq(poolEntries.id, e.id)),
    ),
  );

  revalidatePath("/dashboard/talent-pool");
  revalidatePath("/dashboard/candidates");
  return { success: true };
}

const assignFromPoolSchema = z.object({
  candidateId: z.string().uuid(),
  jobId: z.string().uuid(),
});

export async function assignFromPoolToJobAction(input: {
  candidateId: string;
  jobId: string;
}): Promise<PoolActionState> {
  const parsed = assignFromPoolSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input." };

  const { organization: workspace } = await requirePermission("candidates:edit");

  // Verify candidate exists
  const [candidate] = await db
    .select({ id: candidates.id })
    .from(candidates)
    .where(
      and(
        eq(candidates.id, parsed.data.candidateId),
        eq(candidates.workspaceId, workspace.id),
        isNull(candidates.deletedAt),
      ),
    )
    .limit(1);

  if (!candidate) {
    return { success: false, error: "Candidate not found." };
  }

  // Verify job exists and is open
  const [job] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.id, parsed.data.jobId),
        eq(jobs.workspaceId, workspace.id),
        eq(jobs.status, "open"),
        isNull(jobs.deletedAt),
      ),
    )
    .limit(1);

  if (!job) {
    return { success: false, error: "Job is not open or was not found." };
  }

  // Check for duplicate application
  const [duplicate] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.workspaceId, workspace.id),
        eq(applications.candidateId, parsed.data.candidateId),
        eq(applications.jobId, parsed.data.jobId),
      ),
    )
    .limit(1);

  if (duplicate) {
    return { success: false, error: "Candidate already has an application for this job." };
  }

  // Get first stage of the job
  const [firstStage] = await db
    .select({ id: jobStages.id })
    .from(jobStages)
    .where(
      and(
        eq(jobStages.workspaceId, workspace.id),
        eq(jobStages.jobId, parsed.data.jobId),
      ),
    )
    .orderBy(asc(jobStages.order))
    .limit(1);

  if (!firstStage) {
    return { success: false, error: "Job has no pipeline stages." };
  }

  // Get next pipeline order
  const [nextOrder] = await db
    .select({
      value: sql<number>`coalesce(max(${applications.pipelineOrder}), 0) + 1`,
    })
    .from(applications)
    .where(
      and(
        eq(applications.workspaceId, workspace.id),
        eq(applications.currentStageId, firstStage.id),
      ),
    );

  // Create application
  const created = await db.transaction(async (tx) => {
    const [application] = await tx
      .insert(applications)
      .values({
        workspaceId: workspace.id,
        candidateId: parsed.data.candidateId,
        jobId: parsed.data.jobId,
        currentStageId: firstStage.id,
        pipelineOrder: nextOrder?.value ?? 1,
        source: "sourced",
        status: "active",
        appliedAt: new Date(),
      })
      .onConflictDoNothing({
        target: [
          applications.workspaceId,
          applications.candidateId,
          applications.jobId,
        ],
      })
      .returning();

    if (!application) return null;
    await tx.insert(applicationStageHistory).values({
      workspaceId: workspace.id,
      applicationId: application.id,
      fromStageId: null,
      toStageId: firstStage.id,
      movedById: null,
    });
    return application;
  });

  if (!created) {
    return {
      success: false,
      error: "Candidate already has an application for this job.",
    };
  }

  revalidatePath("/dashboard/talent-pool");
  revalidatePath("/dashboard/candidates");
  revalidatePath("/dashboard/pipeline");
  revalidatePath(`/dashboard/jobs/${parsed.data.jobId}`);
  return { success: true };
}

const bulkAssignFromPoolSchema = z.object({
  candidateIds: z.array(z.string().uuid()).min(1).max(50),
  jobId: z.string().uuid(),
});

export async function bulkAssignFromPoolToJobAction(input: {
  candidateIds: string[];
  jobId: string;
}): Promise<PoolActionState & { assigned?: number; failed?: number }> {
  const parsed = bulkAssignFromPoolSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input." };

  let assigned = 0;
  let failed = 0;

  for (const candidateId of parsed.data.candidateIds) {
    const result = await assignFromPoolToJobAction({
      candidateId,
      jobId: parsed.data.jobId,
    });
    if (result.success) assigned++;
    else failed++;
  }

  return {
    success: true,
    assigned,
    failed,
  };
}
