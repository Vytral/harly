"use server";

import { and, eq, max } from "drizzle-orm";
import { z } from "zod";

import {
  db,
  evaluationCriteria,
  evaluationRubrics,
  jobs,
} from "@harly/db";
import {
  requireJobPermission,
  requirePermission,
} from "@/features/workspaces/permissions-server";
import { hashEvaluationInput } from "./service";
import { evaluationRubricInputSchema } from "./rubric-schema";

export type RubricActionResult =
  | { success: true; rubricId: string; version: number }
  | { success: false; error: string };

/** Create an immutable draft. Publishing is a separate explicit action. */
export async function createEvaluationRubricAction(
  input: unknown,
): Promise<RubricActionResult> {
  const parsed = evaluationRubricInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid evaluation rubric." };
  const context = await requireJobPermission("jobs:edit", parsed.data.jobId);

  const [job] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.id, parsed.data.jobId), eq(jobs.workspaceId, context.organization.id)))
    .limit(1);
  if (!job) return { success: false, error: "Job not found." };

  const configHash = hashEvaluationInput(parsed.data.criteria);
  const result = await db.transaction(async (tx) => {
    const [latest] = await tx
      .select({ version: max(evaluationRubrics.version) })
      .from(evaluationRubrics)
      .where(
        and(
          eq(evaluationRubrics.workspaceId, context.organization.id),
          eq(evaluationRubrics.jobId, parsed.data.jobId),
        ),
      );
    const version = Number(latest?.version ?? 0) + 1;
    const [rubric] = await tx
      .insert(evaluationRubrics)
      .values({
        workspaceId: context.organization.id,
        jobId: parsed.data.jobId,
        version,
        status: "draft",
        configHash,
        createdById: context.user.id,
      })
      .returning({ id: evaluationRubrics.id });
    if (!rubric) throw new Error("Could not create evaluation rubric.");
    await tx.insert(evaluationCriteria).values(
      parsed.data.criteria.map((criterion) => ({
        rubricId: rubric.id,
        key: criterion.key,
        label: criterion.label,
        type: criterion.type,
        importance: criterion.importance,
        weight: criterion.weight,
        aliases: criterion.aliases,
        minimumValue: criterion.minimumValue ?? null,
      })),
    );
    return { id: rubric.id, version };
  });

  return { success: true, rubricId: result.id, version: result.version };
}

/** Publish only a workspace-owned rubric and retire the previous published one. */
export async function publishEvaluationRubricAction(input: unknown): Promise<RubricActionResult> {
  const parsed = z.object({ rubricId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid rubric." };
  const context = await requirePermission("jobs:edit");

  const [targetRubric] = await db
    .select({ jobId: evaluationRubrics.jobId })
    .from(evaluationRubrics)
    .where(
      and(
        eq(evaluationRubrics.id, parsed.data.rubricId),
        eq(evaluationRubrics.workspaceId, context.organization.id),
      ),
    )
    .limit(1);
  if (!targetRubric) return { success: false, error: "Rubric not found." };
  await requireJobPermission("jobs:edit", targetRubric.jobId);

  const result = await db.transaction(async (tx) => {
    const [rubric] = await tx
      .select({ id: evaluationRubrics.id, jobId: evaluationRubrics.jobId, version: evaluationRubrics.version })
      .from(evaluationRubrics)
      .where(
        and(
          eq(evaluationRubrics.id, parsed.data.rubricId),
          eq(evaluationRubrics.workspaceId, context.organization.id),
        ),
      )
      .limit(1);
    if (!rubric) return null;

    await tx
      .update(evaluationRubrics)
      .set({ status: "archived", updatedAt: new Date() })
      .where(
        and(
          eq(evaluationRubrics.workspaceId, context.organization.id),
          eq(evaluationRubrics.jobId, rubric.jobId),
          eq(evaluationRubrics.status, "published"),
        ),
      );
    await tx
      .update(evaluationRubrics)
      .set({ status: "published", publishedAt: new Date(), updatedAt: new Date() })
      .where(eq(evaluationRubrics.id, rubric.id));
    return rubric;
  });

  return result
    ? { success: true, rubricId: result.id, version: result.version }
    : { success: false, error: "Rubric not found." };
}
