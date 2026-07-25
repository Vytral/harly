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

import {
  requireJobPermission,
} from "@/features/workspaces/permissions-server";
import { createLogger } from "@/lib/logger";
import { emitWebhookEvent } from "@/server/webhooks/emit";
import {
  fetchGreenhouseCandidateImportRows,
  GreenhouseImportError,
} from "./greenhouse";
import {
  fetchWorkableCandidateImportRows,
  WorkableImportError,
} from "./workable";
import { fetchAshbyCandidateImportRows, AshbyImportError } from "./ashby";
import { fetchLeverCandidateImportRows, LeverImportError } from "./lever";

const log = createLogger("candidate-import");

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null));

const optionalImportedText = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim() ?? "";
    return trimmed.length > 0 ? trimmed : null;
  });

const importedStringList = z
  .string()
  .optional()
  .transform((value) => {
    try {
      const parsed: unknown = JSON.parse(value ?? "[]");
      return Array.isArray(parsed)
        ? parsed
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 100)
        : [];
    } catch {
      return [];
    }
  });

const importedEducationEntries = z
  .string()
  .optional()
  .transform((value) => {
    try {
      const parsed: unknown = JSON.parse(value ?? "[]");
      return Array.isArray(parsed)
        ? parsed.filter(
            (
              entry,
            ): entry is {
              id: string;
              school: string;
              degree: string | null;
              field: string | null;
              startDate: string | null;
              endDate: string | null;
              description: string | null;
            } =>
              typeof entry === "object" &&
              entry !== null &&
              typeof (entry as { id?: unknown }).id === "string" &&
              typeof (entry as { school?: unknown }).school === "string",
          )
        : [];
    } catch {
      return [];
    }
  });

const importedExperienceEntries = z
  .string()
  .optional()
  .transform((value) => {
    try {
      const parsed: unknown = JSON.parse(value ?? "[]");
      return Array.isArray(parsed)
        ? parsed.filter(
            (
              entry,
            ): entry is {
              id: string;
              company: string;
              title: string;
              startDate: string | null;
              endDate: string | null;
              current: boolean | null;
              location: string | null;
              description: string | null;
            } =>
              typeof entry === "object" &&
              entry !== null &&
              typeof (entry as { id?: unknown }).id === "string" &&
              typeof (entry as { company?: unknown }).company === "string" &&
              typeof (entry as { title?: unknown }).title === "string",
          )
        : [];
    } catch {
      return [];
    }
  });

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
  summary: optionalImportedText,
  skills: importedStringList,
  educationEntries: importedEducationEntries,
  experienceEntries: importedExperienceEntries,
});

const importSchema = z.object({
  jobId: z.uuid(),
  rows: z
    .array(
      z.object({
        rowNumber: z.number().int().min(2),
        values: z.record(z.string(), z.string()),
      }),
    )
    .min(1, "No rows to import.")
    .max(500, "You can import up to 500 rows at a time."),
});

export type ImportCandidatesResult =
  | {
      success: true;
      imported: number;
      alreadyInPipeline: number;
      errors: { row: number; email: string; reason: string }[];
    }
  | { success: false; error: string };

/** Imports a full Greenhouse candidate export into one existing Harly pipeline.
 * The credential is used only for this request and is never written to the DB or logs. */
export async function importGreenhouseCandidatesAction(input: {
  jobId: string;
  apiKey: string;
}): Promise<ImportCandidatesResult & { skipped?: number }> {
  if (
    !z.uuid().safeParse(input.jobId).success ||
    typeof input.apiKey !== "string"
  ) {
    return { success: false, error: "Invalid Greenhouse import request." };
  }
  try {
    await requireJobPermission("candidates:edit", input.jobId);
  } catch (error) {
    log.error(error, "Greenhouse import permission failed");
    return {
      success: false,
      error: "You do not have permission to add candidates.",
    };
  }
  const apiKey = input.apiKey.trim();
  try {
    const exportRows = await fetchGreenhouseCandidateImportRows(apiKey);
    if (exportRows.rows.length === 0)
      return {
        success: true,
        imported: 0,
        alreadyInPipeline: 0,
        errors: [],
        skipped: exportRows.skipped,
      };
    const totals = {
      imported: 0,
      alreadyInPipeline: 0,
      errors: [] as { row: number; email: string; reason: string }[],
    };
    for (let start = 0; start < exportRows.rows.length; start += 500) {
      const result = await importCandidatesAction({
        jobId: input.jobId,
        rows: exportRows.rows.slice(start, start + 500),
      });
      if (!result.success) return result;
      totals.imported += result.imported;
      totals.alreadyInPipeline += result.alreadyInPipeline;
      totals.errors.push(...result.errors);
    }
    return { success: true, ...totals, skipped: exportRows.skipped };
  } catch (error) {
    if (error instanceof GreenhouseImportError)
      return { success: false, error: error.message };
    log.error(error, "Greenhouse candidate import failed");
    return {
      success: false,
      error: "Could not import candidates from Greenhouse.",
    };
  }
}

export async function importWorkableCandidatesAction(input: {
  jobId: string;
  subdomain: string;
  apiToken: string;
}): Promise<ImportCandidatesResult & { skipped?: number }> {
  if (
    !z.uuid().safeParse(input.jobId).success ||
    typeof input.subdomain !== "string" ||
    typeof input.apiToken !== "string"
  )
    return { success: false, error: "Invalid Workable import request." };
  try {
    await requireJobPermission("candidates:edit", input.jobId);
    const exportRows = await fetchWorkableCandidateImportRows(input);
    if (exportRows.rows.length === 0)
      return {
        success: true,
        imported: 0,
        alreadyInPipeline: 0,
        errors: [],
        skipped: exportRows.skipped,
      };
    const totals = {
      imported: 0,
      alreadyInPipeline: 0,
      errors: [] as { row: number; email: string; reason: string }[],
    };
    for (let start = 0; start < exportRows.rows.length; start += 500) {
      const result = await importCandidatesAction({
        jobId: input.jobId,
        rows: exportRows.rows.slice(start, start + 500),
      });
      if (!result.success) return result;
      totals.imported += result.imported;
      totals.alreadyInPipeline += result.alreadyInPipeline;
      totals.errors.push(...result.errors);
    }
    return { success: true, ...totals, skipped: exportRows.skipped };
  } catch (error) {
    if (error instanceof WorkableImportError)
      return { success: false, error: error.message };
    log.error(error, "Workable candidate import failed");
    return {
      success: false,
      error: "Could not import candidates from Workable.",
    };
  }
}

export async function importAshbyCandidatesAction(input: {
  jobId: string;
  apiKey: string;
}): Promise<ImportCandidatesResult & { skipped?: number }> {
  if (
    !z.uuid().safeParse(input.jobId).success ||
    typeof input.apiKey !== "string"
  )
    return { success: false, error: "Invalid Ashby import request." };
  try {
    await requireJobPermission("candidates:edit", input.jobId);
    const exportRows = await fetchAshbyCandidateImportRows(input.apiKey);
    if (exportRows.rows.length === 0)
      return {
        success: true,
        imported: 0,
        alreadyInPipeline: 0,
        errors: [],
        skipped: exportRows.skipped,
      };
    const totals = {
      imported: 0,
      alreadyInPipeline: 0,
      errors: [] as { row: number; email: string; reason: string }[],
    };
    for (let start = 0; start < exportRows.rows.length; start += 500) {
      const result = await importCandidatesAction({
        jobId: input.jobId,
        rows: exportRows.rows.slice(start, start + 500),
      });
      if (!result.success) return result;
      totals.imported += result.imported;
      totals.alreadyInPipeline += result.alreadyInPipeline;
      totals.errors.push(...result.errors);
    }
    return { success: true, ...totals, skipped: exportRows.skipped };
  } catch (error) {
    if (error instanceof AshbyImportError)
      return { success: false, error: error.message };
    log.error(error, "Ashby candidate import failed");
    return { success: false, error: "Could not import candidates from Ashby." };
  }
}

export async function importLeverCandidatesAction(input: {
  jobId: string;
  apiKey: string;
}): Promise<ImportCandidatesResult & { skipped?: number }> {
  if (
    !z.uuid().safeParse(input.jobId).success ||
    typeof input.apiKey !== "string"
  )
    return { success: false, error: "Invalid Lever import request." };
  try {
    await requireJobPermission("candidates:edit", input.jobId);
    const exportRows = await fetchLeverCandidateImportRows(input.apiKey);
    if (exportRows.rows.length === 0)
      return {
        success: true,
        imported: 0,
        alreadyInPipeline: 0,
        errors: [],
        skipped: exportRows.skipped,
      };
    const totals = {
      imported: 0,
      alreadyInPipeline: 0,
      errors: [] as { row: number; email: string; reason: string }[],
    };
    for (let start = 0; start < exportRows.rows.length; start += 500) {
      const result = await importCandidatesAction({
        jobId: input.jobId,
        rows: exportRows.rows.slice(start, start + 500),
      });
      if (!result.success) return result;
      totals.imported += result.imported;
      totals.alreadyInPipeline += result.alreadyInPipeline;
      totals.errors.push(...result.errors);
    }
    return { success: true, ...totals, skipped: exportRows.skipped };
  } catch (error) {
    if (error instanceof LeverImportError)
      return { success: false, error: error.message };
    log.error(error, "Lever candidate import failed");
    return { success: false, error: "Could not import candidates from Lever." };
  }
}

export async function importCandidatesAction(input: {
  jobId: string;
  rows: { rowNumber: number; values: Record<string, string> }[];
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
    context = await requireJobPermission("candidates:edit", parsed.data.jobId);
  } catch (error) {
    log.error(error, "importCandidatesAction permission failed");
    return {
      success: false,
      error: "You do not have permission to add candidates.",
    };
  }
  const workspaceId = context.organization.id;

  const [job] = await db
    .select({ id: jobs.id, title: jobs.title })
    .from(jobs)
    .where(
      and(eq(jobs.workspaceId, workspaceId), eq(jobs.id, parsed.data.jobId)),
    )
    .limit(1);

  if (!job) {
    return { success: false, error: "Job not found." };
  }

  const [firstStage] = await db
    .select({ id: jobStages.id })
    .from(jobStages)
    .where(
      and(eq(jobStages.workspaceId, workspaceId), eq(jobStages.jobId, job.id)),
    )
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
  const importedApplicationIds: string[] = [];

  for (const importedRow of parsed.data.rows) {
    const raw = importedRow.values;
    const row = importRowSchema.safeParse(raw);
    if (!row.success) {
      errors.push({
        row: importedRow.rowNumber,
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
                  summary: values.summary,
                  skills: values.skills,
                  educationEntries: values.educationEntries,
                  experienceEntries: values.experienceEntries,
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
        importedApplicationIds.push(application.id);
      });
    } catch (error) {
      log.error(error, "importCandidatesAction row import failed");
      errors.push({
        row: importedRow.rowNumber,
        email: values.email,
        reason: "Could not import this row.",
      });
    }
  }

  revalidatePath("/dashboard/candidates");
  revalidatePath("/dashboard/pipeline");

  for (const applicationId of importedApplicationIds) {
    void emitWebhookEvent(workspaceId, "application.created", {
      application: { id: applicationId },
      source: "csv_import",
    });
  }

  return { success: true, imported, alreadyInPipeline, errors };
}
