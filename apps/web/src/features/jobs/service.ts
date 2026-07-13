import "server-only";

import { and, desc, eq, isNull, lt, or } from "drizzle-orm";

import { ApiError, type Cursor } from "@harly/api";
import { db, jobs, jobStages, type Job } from "@harly/db";

import { emitWebhookEvent } from "@/server/webhooks/emit";

import { generateUniqueJobSlug } from "./data";
import type { JobStatus } from "./validation";

/**
 * Workspace-scoped job service consumed by the REST API. Session-free: every
 * function takes an explicit `workspaceId` (resolved from the API key) so the
 * same logic is reusable outside a user session.
 */

const DEFAULT_API_STAGES = [
  { name: "Applied", color: "#E0F2FE" },
  { name: "Screening", color: "#F5F3FF" },
  { name: "Interview", color: "#FEF3C7" },
  { name: "Offer", color: "#DCFCE7" },
  { name: "Hired", color: "#CCFBF1" },
  { name: "Rejected", color: "#FEE2E2" },
];

export type JobApiInput = {
  title: string;
  description: string;
  slug?: string;
  department?: string | null;
  location?: string | null;
  employmentType: Job["employmentType"];
  workplaceType: Job["workplaceType"];
  experienceLevel?: string | null;
  status?: JobStatus;
  requirements?: string | null;
  benefits?: string | null;
  keywords?: string[];
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  salaryPeriod?: string | null;
};

export function serializeJob(job: Job) {
  return {
    id: job.id,
    title: job.title,
    slug: job.slug,
    status: job.status,
    department: job.department,
    location: job.location,
    employmentType: job.employmentType,
    workplaceType: job.workplaceType,
    description: job.description,
    requirements: job.requirements,
    benefits: job.benefits,
    keywords: job.keywords,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    currency: job.currency,
    salaryPeriod: job.salaryPeriod,
    publishedAt: job.publishedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

/** Public (unauthenticated) job shape for the embed widget / board API. */
export function serializePublicJob(job: Job, workspaceSlug: string) {
  const base = appBaseUrl();
  return {
    id: job.id,
    slug: job.slug,
    title: job.title,
    department: job.department,
    location: job.location,
    employmentType: job.employmentType,
    workplaceType: job.workplaceType,
    description: job.description,
    requirements: job.requirements,
    benefits: job.benefits,
    keywords: job.keywords,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    currency: job.currency,
    salaryPeriod: job.salaryPeriod,
    publishedAt: job.publishedAt?.toISOString() ?? null,
    // Where the company's careers page can deep-link for the hosted apply flow.
    hostedApplyUrl: `${base}/apply/${job.slug}?workspace=${workspaceSlug}`,
    boardUrl: `${base}/board/${workspaceSlug}`,
  };
}

/** Cursor predicate for (createdAt desc, id desc) keyset pagination. */
function cursorWhere(cursor: Cursor | null) {
  if (!cursor) return undefined;
  const createdAt = new Date(cursor.createdAt);
  return or(
    lt(jobs.createdAt, createdAt),
    and(eq(jobs.createdAt, createdAt), lt(jobs.id, cursor.id)),
  );
}

export async function listJobsForApi(input: {
  workspaceId: string;
  status?: JobStatus;
  cursor: Cursor | null;
  limit: number;
}): Promise<Job[]> {
  return db
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.workspaceId, input.workspaceId),
        isNull(jobs.deletedAt),
        input.status ? eq(jobs.status, input.status) : undefined,
        cursorWhere(input.cursor),
      ),
    )
    .orderBy(desc(jobs.createdAt), desc(jobs.id))
    .limit(input.limit + 1);
}

export async function getJobForApi(input: {
  workspaceId: string;
  jobId: string;
}): Promise<Job> {
  const [job] = await db
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.id, input.jobId),
        eq(jobs.workspaceId, input.workspaceId),
        isNull(jobs.deletedAt),
      ),
    )
    .limit(1);
  if (!job) throw ApiError.notFound("Job not found.");
  return job;
}

export async function createJobForApi(input: {
  workspaceId: string;
  actorUserId: string;
  values: JobApiInput;
}): Promise<Job> {
  const { workspaceId, actorUserId, values } = input;
  const slug = await generateUniqueJobSlug(
    workspaceId,
    values.slug ?? values.title,
  );
  const status: JobStatus = values.status ?? "draft";

  const job = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(jobs)
      .values({
        workspaceId,
        title: values.title,
        slug,
        description: values.description,
        department: values.department ?? null,
        location: values.location ?? null,
        employmentType: values.employmentType,
        workplaceType: values.workplaceType,
        experienceLevel: values.experienceLevel ?? null,
        requirements: values.requirements ?? null,
        benefits: values.benefits ?? null,
        keywords: values.keywords ?? [],
        salaryMin: values.salaryMin ?? null,
        salaryMax: values.salaryMax ?? null,
        currency: values.currency ?? null,
        salaryPeriod: values.salaryPeriod ?? null,
        status,
        publishedAt: status === "open" ? new Date() : null,
        createdById: actorUserId,
      })
      .returning();

    await tx.insert(jobStages).values(
      DEFAULT_API_STAGES.map((stage, index) => ({
        workspaceId,
        jobId: created.id,
        name: stage.name,
        color: stage.color,
        order: index + 1,
      })),
    );

    return created;
  });

  if (status === "open") {
    await emitWebhookEvent(workspaceId, "job.published", {
      job: serializeJob(job),
    });
  }
  return job;
}

export async function updateJobForApi(input: {
  workspaceId: string;
  jobId: string;
  values: Partial<JobApiInput>;
}): Promise<Job> {
  const existing = await getJobForApi({
    workspaceId: input.workspaceId,
    jobId: input.jobId,
  });

  const nextStatus = input.values.status ?? existing.status;
  const becomesPublished = nextStatus === "open" && !existing.publishedAt;

  const [updated] = await db
    .update(jobs)
    .set({
      title: input.values.title ?? existing.title,
      description: input.values.description ?? existing.description,
      department: input.values.department ?? existing.department,
      location: input.values.location ?? existing.location,
      employmentType: input.values.employmentType ?? existing.employmentType,
      workplaceType: input.values.workplaceType ?? existing.workplaceType,
      requirements: input.values.requirements ?? existing.requirements,
      benefits: input.values.benefits ?? existing.benefits,
      keywords: input.values.keywords ?? (existing.keywords as string[]),
      salaryMin: input.values.salaryMin ?? existing.salaryMin,
      salaryMax: input.values.salaryMax ?? existing.salaryMax,
      currency: input.values.currency ?? existing.currency,
      salaryPeriod: input.values.salaryPeriod ?? existing.salaryPeriod,
      status: nextStatus,
      publishedAt: becomesPublished ? new Date() : existing.publishedAt,
      updatedAt: new Date(),
    })
    .where(
      and(eq(jobs.id, input.jobId), eq(jobs.workspaceId, input.workspaceId)),
    )
    .returning();

  if (becomesPublished) {
    await emitWebhookEvent(input.workspaceId, "job.published", {
      job: serializeJob(updated),
    });
  }
  return updated;
}

export async function setJobStatusForApi(input: {
  workspaceId: string;
  jobId: string;
  status: JobStatus;
}): Promise<Job> {
  return updateJobForApi({
    workspaceId: input.workspaceId,
    jobId: input.jobId,
    values: { status: input.status },
  });
}

export async function deleteJobForApi(input: {
  workspaceId: string;
  jobId: string;
}): Promise<void> {
  await getJobForApi({ workspaceId: input.workspaceId, jobId: input.jobId });
  await db
    .update(jobs)
    .set({ deletedAt: new Date(), status: "closed", updatedAt: new Date() })
    .where(
      and(eq(jobs.id, input.jobId), eq(jobs.workspaceId, input.workspaceId)),
    );
}
