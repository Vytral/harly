"use server";

import { and, eq, max } from "drizzle-orm";
import { z } from "zod";
import { getTranslations } from "@/i18n/server";

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
import {
  evaluationRubricInputSchema,
  toEffectiveCriterion,
  validateRubricGates,
} from "./rubric-schema";

export type RubricActionResult =
  | { success: true; rubricId: string; version: number }
  | { success: false; error: string };

/** Create an immutable draft. Publishing is a separate explicit action. */
export async function createEvaluationRubricAction(
  input: unknown,
): Promise<RubricActionResult> {
  const t = await getTranslations("server.evaluations.rubric");
  const parsed = evaluationRubricInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: t("invalidRubric") };
  // Phase 2 governance (§2.3): reject invalid gates before touching auth/DB.
  const gateError = validateRubricGates(parsed.data.criteria, await getTranslations("server.evaluations.rubric"));
  if (gateError) return { success: false, error: gateError };
  const context = await requireJobPermission("jobs:edit", parsed.data.jobId);

  const [job] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.id, parsed.data.jobId), eq(jobs.workspaceId, context.organization.id)))
    .limit(1);
  if (!job) return { success: false, error: t("jobNotFound") };

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
    if (!rubric) throw new Error(t("createRubricFailed"));
    await tx.insert(evaluationCriteria).values(
      parsed.data.criteria.map((criterion) => ({
        rubricId: rubric.id,
        ...toEffectiveCriterion(criterion),
      })),
    );
    return { id: rubric.id, version };
  });

  return { success: true, rubricId: result.id, version: result.version };
}

/** Publish only a workspace-owned rubric and retire the previous published one. */
export async function publishEvaluationRubricAction(input: unknown): Promise<RubricActionResult> {
  const t = await getTranslations("server.evaluations.rubric");
  const parsed = z.object({ rubricId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { success: false, error: t("invalidRubricInput") };
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
  if (!targetRubric) return { success: false, error: t("rubricNotFound") };
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
    : { success: false, error: t("rubricNotFound") };
}
