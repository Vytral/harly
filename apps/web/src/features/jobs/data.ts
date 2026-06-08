import "server-only";

import { and, asc, desc, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";

import { slugify } from "@/lib/utils";
import { db } from "@harly/db";
import {
  applicationQuestions,
  applications,
  jobStages,
  jobs,
  organization,
  workspaceSettings,
} from "@harly/db";
import {
  normalizeBoardStyle,
  normalizeLogoStyle,
  normalizePrimaryColor,
  type WorkspaceBoardBranding,
} from "@/features/workspaces/board";
import { getWorkspaceContext } from "@/features/workspaces/context";
import type { JobFormValues, JobStatus } from "./validation";

// Branding is sourced from the Better Auth `organization` (name/slug/logo) plus
// the `workspace_settings` satellite (board theming). Left join so a workspace
// without a settings row still resolves with defaults.
const workspaceBrandingSelect = {
  id: organization.id,
  name: organization.name,
  slug: organization.slug,
  logoUrl: organization.logo,
  tagline: workspaceSettings.tagline,
  description: workspaceSettings.description,
  websiteUrl: workspaceSettings.websiteUrl,
  primaryColor: workspaceSettings.primaryColor,
  heroImageUrl: workspaceSettings.heroImageUrl,
  boardStyle: workspaceSettings.boardStyle,
  logoStyle: workspaceSettings.logoStyle,
} as const;

type WorkspaceBrandingRow = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  tagline: string | null;
  description: string | null;
  websiteUrl: string | null;
  primaryColor: string | null;
  heroImageUrl: string | null;
  boardStyle: string | null;
  logoStyle: string | null;
};

export function toBoardBranding(
  row: WorkspaceBrandingRow,
): WorkspaceBoardBranding & { id: string } {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logoUrl: row.logoUrl,
    tagline: row.tagline,
    description: row.description,
    websiteUrl: row.websiteUrl,
    primaryColor: normalizePrimaryColor(row.primaryColor),
    heroImageUrl: row.heroImageUrl,
    boardStyle: normalizeBoardStyle(row.boardStyle),
    logoStyle: normalizeLogoStyle(row.logoStyle),
  };
}

export { formatEmploymentType, formatWorkplaceType, formatJobStatus } from "@/lib/format";

const defaultStages = [
  { name: "Applied", color: "#E0F2FE" },
  { name: "Screening", color: "#F5F3FF" },
  { name: "Interview", color: "#FEF3C7" },
  { name: "Offer", color: "#DCFCE7" },
  { name: "Hired", color: "#CCFBF1" },
  { name: "Rejected", color: "#FEE2E2" },
];

async function syncJobApplicationQuestions(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: {
    workspaceId: string;
    jobId: string;
    values: JobFormValues["applicationConfig"]["questions"];
  },
) {
  for (const [index, question] of input.values.entries()) {
    await tx
      .insert(applicationQuestions)
      .values({
        workspaceId: input.workspaceId,
        jobId: input.jobId,
        key: question.id,
        label: question.label,
        type: question.type,
        required: question.required,
        minLength: question.minLength,
        placeholder: question.placeholder,
        options: question.options ? [...question.options] : [],
        order: index + 1,
      })
      .onConflictDoUpdate({
        target: [applicationQuestions.jobId, applicationQuestions.key],
        set: {
          label: question.label,
          type: question.type,
          required: question.required,
          minLength: question.minLength,
          placeholder: question.placeholder,
          options: question.options ? [...question.options] : [],
          order: index + 1,
          updatedAt: new Date(),
        },
      });
  }
}

export async function listDashboardJobs() {
  const { organization: workspace } = await getWorkspaceContext();

  return db
    .select()
    .from(jobs)
    .where(and(eq(jobs.workspaceId, workspace.id), isNull(jobs.deletedAt)))
    .orderBy(desc(jobs.createdAt));
}

/** Jobs list enriched with per-role applicant counts for the dashboard table. */
export async function listJobsWithStats() {
  const { organization: workspace } = await getWorkspaceContext();
  // Bind as ISO string — the raw sql template can't parametrize a JS Date here.
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

  return db
    .select({
      id: jobs.id,
      title: jobs.title,
      slug: jobs.slug,
      department: jobs.department,
      location: jobs.location,
      employmentType: jobs.employmentType,
      workplaceType: jobs.workplaceType,
      status: jobs.status,
      createdAt: jobs.createdAt,
      applicants: sql<number>`count(${applications.id})::int`,
      activeApplicants: sql<number>`count(*) filter (where ${applications.status} = 'active')::int`,
      newApplicants: sql<number>`count(*) filter (where ${applications.appliedAt} >= ${weekAgo}::timestamptz)::int`,
    })
    .from(jobs)
    .leftJoin(
      applications,
      and(
        eq(applications.workspaceId, workspace.id),
        eq(applications.jobId, jobs.id),
      ),
    )
    .where(and(eq(jobs.workspaceId, workspace.id), isNull(jobs.deletedAt)))
    .groupBy(jobs.id)
    .orderBy(desc(jobs.createdAt));
}

/** Distinct department names across the workspace's jobs — for the combobox. */
export async function listWorkspaceDepartments() {
  const { organization: workspace } = await getWorkspaceContext();

  const rows = await db
    .selectDistinct({ department: jobs.department })
    .from(jobs)
    .where(
      and(eq(jobs.workspaceId, workspace.id), isNotNull(jobs.department)),
    )
    .orderBy(asc(jobs.department));

  return rows
    .map((row) => row.department)
    .filter((d): d is string => Boolean(d && d.trim()));
}

export async function listTrashedJobs() {
  const { organization: workspace } = await getWorkspaceContext();

  return db
    .select()
    .from(jobs)
    .where(
      and(eq(jobs.workspaceId, workspace.id), sql`${jobs.deletedAt} is not null`),
    )
    .orderBy(desc(jobs.deletedAt));
}

/** Move a job to the trash (soft delete) — reversible. */
export async function trashJob(jobId: string) {
  const { organization: workspace } = await getWorkspaceContext();
  const [job] = await db
    .update(jobs)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(jobs.id, jobId),
        eq(jobs.workspaceId, workspace.id),
        isNull(jobs.deletedAt),
      ),
    )
    .returning({ id: jobs.id, slug: jobs.slug });

  return job ? ({ ok: true, slug: job.slug } as const) : ({ ok: false, error: "Job not found." } as const);
}

/** Restore a job out of the trash. */
export async function restoreJob(jobId: string) {
  const { organization: workspace } = await getWorkspaceContext();
  const [job] = await db
    .update(jobs)
    .set({ deletedAt: null })
    .where(and(eq(jobs.id, jobId), eq(jobs.workspaceId, workspace.id)))
    .returning({ id: jobs.id });

  return job ? ({ ok: true } as const) : ({ ok: false, error: "Job not found." } as const);
}

export async function listOpenJobs() {
  return db
    .select()
    .from(jobs)
    .where(eq(jobs.status, "open"))
    .orderBy(desc(jobs.publishedAt), desc(jobs.createdAt));
}

export async function listOpenJobsForWorkspaceSlug(workspaceSlug: string) {
  const [row] = await db
    .select(workspaceBrandingSelect)
    .from(organization)
    .leftJoin(
      workspaceSettings,
      eq(workspaceSettings.organizationId, organization.id),
    )
    .where(eq(organization.slug, workspaceSlug))
    .limit(1);

  if (!row) {
    return { workspace: null, jobs: [] };
  }

  const workspace = toBoardBranding(row);

  const workspaceJobs = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.workspaceId, workspace.id), eq(jobs.status, "open")))
    .orderBy(desc(jobs.publishedAt), desc(jobs.createdAt));

  return { workspace, jobs: workspaceJobs };
}

export async function getDashboardJob(jobId: string) {
  const { organization: workspace } = await getWorkspaceContext();
  const [job] = await db
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.id, jobId),
        eq(jobs.workspaceId, workspace.id),
        isNull(jobs.deletedAt),
      ),
    )
    .limit(1);

  if (!job) {
    return null;
  }

  const stages = await db
    .select()
    .from(jobStages)
    .where(and(eq(jobStages.jobId, job.id), eq(jobStages.workspaceId, workspace.id)))
    .orderBy(asc(jobStages.order));

  return { job, stages, workspace };
}

export async function getPublicJob(slug: string) {
  const detail = await getPublicJobDetail({ jobSlug: slug });
  return detail?.job ?? null;
}

export async function getPublicJobDetail(input: {
  jobSlug: string;
  workspaceSlug?: string;
}) {
  const [row] = await db
    .select({
      job: jobs,
      workspace: workspaceBrandingSelect,
    })
    .from(jobs)
    .innerJoin(organization, eq(organization.id, jobs.workspaceId))
    .leftJoin(
      workspaceSettings,
      eq(workspaceSettings.organizationId, organization.id),
    )
    .where(
      and(
        eq(jobs.slug, input.jobSlug),
        eq(jobs.status, "open"),
        input.workspaceSlug ? eq(organization.slug, input.workspaceSlug) : undefined,
      ),
    )
    .orderBy(desc(jobs.publishedAt), desc(jobs.createdAt))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    job: row.job,
    workspace: toBoardBranding(row.workspace),
  };
}

export async function generateUniqueJobSlug(
  workspaceId: string,
  value: string,
  currentJobId?: string,
) {
  const baseSlug = slugify(value);
  let suffix = 0;

  while (true) {
    const slug = suffix === 0 ? baseSlug : `${baseSlug}-${suffix + 1}`;
    const conditions = [
      eq(jobs.workspaceId, workspaceId),
      eq(jobs.slug, slug),
      currentJobId ? ne(jobs.id, currentJobId) : undefined,
    ].filter(Boolean);

    const [existing] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(...conditions))
      .limit(1);

    if (!existing) {
      return slug;
    }

    suffix += 1;
  }
}

export async function createJob(values: JobFormValues) {
  const { organization: workspace, user } = await getWorkspaceContext();
  const slug = await generateUniqueJobSlug(workspace.id, values.slug ?? values.title);

  const [job] = await db.transaction(async (tx) => {
    const [createdJob] = await tx
      .insert(jobs)
      .values({
        workspaceId: workspace.id,
        title: values.title,
        slug,
        department: values.department,
        sector: values.sector,
        location: values.location,
        employmentType: values.employmentType,
        workplaceType: values.workplaceType,
        experienceLevel: values.experienceLevel,
        education: values.education,
        keywords: values.keywords,
        description: values.description,
        contentSections: values.contentSections,
        salaryMin: values.salaryMin,
        salaryMax: values.salaryMax,
        currency: values.currency,
        salaryPeriod: values.salaryPeriod,
        officeAddress: values.officeAddress,
        officePhotos: values.officePhotos,
        applicationConfig: values.applicationConfig,
        boardConfig: values.boardConfig,
        createdById: user.id,
        status: "draft",
      })
      .returning();

    await tx.insert(jobStages).values(
      defaultStages.map((stage, index) => ({
        workspaceId: workspace.id,
        jobId: createdJob.id,
        name: stage.name,
        color: stage.color,
        order: index + 1,
      })),
    );

    await syncJobApplicationQuestions(tx, {
      workspaceId: workspace.id,
      jobId: createdJob.id,
      values: values.applicationConfig.questions,
    });

    return [createdJob];
  });

  return job;
}

export async function updateJob(jobId: string, values: JobFormValues) {
  const { organization: workspace } = await getWorkspaceContext();
  const slug = await generateUniqueJobSlug(
    workspace.id,
    values.slug ?? values.title,
    jobId,
  );

  const [job] = await db.transaction(async (tx) => {
    const [updatedJob] = await tx
      .update(jobs)
      .set({
        title: values.title,
        slug,
        department: values.department,
        sector: values.sector,
        location: values.location,
        employmentType: values.employmentType,
        workplaceType: values.workplaceType,
        experienceLevel: values.experienceLevel,
        education: values.education,
        keywords: values.keywords,
        description: values.description,
        contentSections: values.contentSections,
        // Legacy fields are migrated into contentSections.
        requirements: null,
        benefits: null,
        salaryMin: values.salaryMin,
        salaryMax: values.salaryMax,
        currency: values.currency,
        salaryPeriod: values.salaryPeriod,
        officeAddress: values.officeAddress,
        officePhotos: values.officePhotos,
        applicationConfig: values.applicationConfig,
        boardConfig: values.boardConfig,
        updatedAt: new Date(),
      })
      .where(and(eq(jobs.id, jobId), eq(jobs.workspaceId, workspace.id)))
      .returning();

    if (updatedJob) {
      await syncJobApplicationQuestions(tx, {
        workspaceId: workspace.id,
        jobId: updatedJob.id,
        values: values.applicationConfig.questions,
      });
    }

    return [updatedJob];
  });

  return job ?? null;
}

/** Permanently delete a job (used from the trash). Blocked if it has applications. */
export async function permanentlyDeleteJob(jobId: string) {
  const { organization: workspace } = await getWorkspaceContext();

  const [job] = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      slug: jobs.slug,
    })
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.workspaceId, workspace.id)))
    .limit(1);

  if (!job) {
    return { ok: false, error: "Job not found." } as const;
  }

  const [applicationCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(applications)
    .where(and(eq(applications.workspaceId, workspace.id), eq(applications.jobId, job.id)));

  if ((applicationCount?.count ?? 0) > 0) {
    return {
      ok: false,
      error: "This job has applications. Close it instead of deleting it.",
    } as const;
  }

  await db
    .delete(jobs)
    .where(and(eq(jobs.id, job.id), eq(jobs.workspaceId, workspace.id)));

  return { ok: true, slug: job.slug } as const;
}

export async function updateJobStatus(jobId: string, status: JobStatus) {
  const { organization: workspace } = await getWorkspaceContext();
  const now = new Date();

  const [job] = await db
    .update(jobs)
    .set({
      status,
      publishedAt: status === "open" ? now : null,
      updatedAt: now,
    })
    .where(and(eq(jobs.id, jobId), eq(jobs.workspaceId, workspace.id)))
    .returning();

  return job ?? null;
}
