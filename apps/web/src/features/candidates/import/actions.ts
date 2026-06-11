"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import {
  activityEvents,
  applications,
  applicationStageHistory,
  candidates,
  db,
  jobs,
  jobStages,
} from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null));

const optionalProfileUrl = z.string().transform((value) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  return URL.canParse(withProtocol) ? withProtocol : null;
});

const importRowSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  email: z
    .string()
    .trim()
    .email("Invalid email address.")
    .transform((value) => value.toLowerCase()),
  phone: optionalText,
  location: optionalText,
  linkedinUrl: optionalProfileUrl,
  githubUrl: optionalProfileUrl,
  websiteUrl: optionalProfileUrl,
  headline: optionalText,
});

const importSchema = z.object({
  jobId: z.uuid(),
  rows: z
    .array(z.record(z.string(), z.string()))
    .min(1, "No rows to import.")
    .max(200, "You can import up to 200 rows at a time."),
});

export type ImportCandidatesResult =
  | {
      success: true;
      imported: number;
      alreadyInPipeline: number;
      errors: { row: number; email: string; reason: string }[];
    }
  | { success: false; error: string };

export async function importCandidatesAction(input: {
  jobId: string;
  rows: Record<string, string>[];
}): Promise<ImportCandidatesResult> {
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid import data.",
    };
  }

  let context;
  try {
    context = await requirePermission("candidates:edit");
  } catch {
    return { success: false, error: "You do not have permission to add candidates." };
  }
  const workspaceId = context.organization.id;

  const [job] = await db
    .select({ id: jobs.id, title: jobs.title })
    .from(jobs)
    .where(and(eq(jobs.workspaceId, workspaceId), eq(jobs.id, parsed.data.jobId)))
    .limit(1);

  if (!job) {
    return { success: false, error: "Job not found." };
  }

  const [firstStage] = await db
    .select({ id: jobStages.id })
    .from(jobStages)
    .where(and(eq(jobStages.workspaceId, workspaceId), eq(jobStages.jobId, job.id)))
    .orderBy(asc(jobStages.order))
    .limit(1);

  if (!firstStage) {
    return { success: false, error: "This job has no pipeline stages yet." };
  }

  const [pipelineCount] = await db
    .select({
      value: sql<number>`coalesce(max(${applications.pipelineOrder}), 0)`,
    })
    .from(applications)
    .where(
      and(
        eq(applications.workspaceId, workspaceId),
        eq(applications.currentStageId, firstStage.id),
      ),
    );
  let nextPipelineOrder = (pipelineCount?.value ?? 0) + 1;

  let imported = 0;
  let alreadyInPipeline = 0;
  const errors: { row: number; email: string; reason: string }[] = [];

  for (const [index, raw] of parsed.data.rows.entries()) {
    const row = importRowSchema.safeParse(raw);
    if (!row.success) {
      errors.push({
        row: index + 1,
        email: raw.email ?? "",
        reason: row.error.issues[0]?.message ?? "Invalid row.",
      });
      continue;
    }
    const values = row.data;

    try {
      await db.transaction(async (tx) => {
        const [existingCandidate] = await tx
          .select({ id: candidates.id })
          .from(candidates)
          .where(
            and(
              eq(candidates.workspaceId, workspaceId),
              sql`lower(${candidates.email}) = ${values.email}`,
            ),
          )
          .limit(1);

        const candidate = existingCandidate
          ? existingCandidate
          : (
              await tx
                .insert(candidates)
                .values({
                  workspaceId,
                  firstName: values.firstName,
                  lastName: values.lastName,
                  email: values.email,
                  phone: values.phone,
                  location: values.location,
                  linkedinUrl: values.linkedinUrl,
                  githubUrl: values.githubUrl,
                  websiteUrl: values.websiteUrl,
                  headline: values.headline,
                })
                .returning({ id: candidates.id })
            )[0];

        if (!candidate) {
          throw new Error("Candidate could not be created.");
        }

        const [duplicateApplication] = await tx
          .select({ id: applications.id })
          .from(applications)
          .where(
            and(
              eq(applications.workspaceId, workspaceId),
              eq(applications.candidateId, candidate.id),
              eq(applications.jobId, job.id),
            ),
          )
          .limit(1);

        if (duplicateApplication) {
          alreadyInPipeline += 1;
          return;
        }

        const pipelineOrder = nextPipelineOrder;
        nextPipelineOrder += 1;

        const [application] = await tx
          .insert(applications)
          .values({
            workspaceId,
            candidateId: candidate.id,
            jobId: job.id,
            currentStageId: firstStage.id,
            pipelineOrder,
            source: "csv_import",
            status: "active",
            appliedAt: new Date(),
          })
          .returning({ id: applications.id });

        if (!application) {
          throw new Error("Application could not be created.");
        }

        await tx.insert(applicationStageHistory).values({
          workspaceId,
          applicationId: application.id,
          fromStageId: null,
          toStageId: firstStage.id,
          movedById: context.user.id,
        });

        await tx.insert(activityEvents).values({
          workspaceId,
          actorId: context.user.id,
          entityType: "application",
          entityId: application.id,
          type: "application.created",
          metadata: {
            jobTitle: job.title,
            candidateName: `${values.firstName} ${values.lastName}`,
            source: "csv_import",
          },
        });

        imported += 1;
      });
    } catch {
      errors.push({ row: index + 1, email: values.email, reason: "Could not import this row." });
    }
  }

  revalidatePath("/dashboard/candidates");
  revalidatePath("/dashboard/pipeline");

  return { success: true, imported, alreadyInPipeline, errors };
}
