import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@openhire/db";
import {
  activityEvents,
  applicationAnswers,
  applicationQuestions,
  applications,
  applicationStageHistory,
  candidates,
  candidateFiles,
  jobs,
  jobStages,
  member as authMembers,
  organization,
  user as authUsers,
} from "@openhire/db";
import { normalizeJobApplicationConfig } from "@/features/jobs/config";
import { buildQuestionAnswerRows } from "@/features/applications/questions";
import type { ApplicationFormValues } from "@/lib/validations/applications";

export type PublicApplicationResult =
  | {
      ok: true;
      email: {
        candidateEmail: string;
        candidateFirstName: string;
        candidateName: string;
        jobTitle: string;
        workspaceName: string;
        workspaceSlug: string;
        ownerEmails: string[];
      };
    }
  | { ok: false; message: string };

export async function getPublicJobApplicationContext(input: {
  jobSlug: string;
  workspaceSlug?: string;
}) {
  const [row] = await db
    .select({
      id: jobs.id,
      workspaceId: jobs.workspaceId,
      keywords: jobs.keywords,
      applicationConfig: jobs.applicationConfig,
    })
    .from(jobs)
    .innerJoin(organization, eq(organization.id, jobs.workspaceId))
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
    id: row.id,
    workspaceId: row.workspaceId,
    keywords: Array.isArray(row.keywords) ? (row.keywords as string[]) : [],
    applicationConfig: normalizeJobApplicationConfig(row.applicationConfig),
  };
}

export async function createPublicApplication(
  input: { jobSlug: string; workspaceSlug?: string },
  values: ApplicationFormValues,
): Promise<PublicApplicationResult> {
  return db.transaction(async (tx) => {
    const [job] = await tx
      .select({
        id: jobs.id,
        title: jobs.title,
        workspaceId: jobs.workspaceId,
      })
      .from(jobs)
      .innerJoin(organization, eq(organization.id, jobs.workspaceId))
      .where(
        and(
          eq(jobs.slug, input.jobSlug),
          eq(jobs.status, "open"),
          input.workspaceSlug ? eq(organization.slug, input.workspaceSlug) : undefined,
        ),
      )
      .orderBy(desc(jobs.publishedAt), desc(jobs.createdAt))
      .limit(1);

    if (!job) {
      return { ok: false, message: "Job not available." };
    }

    const workspaceId = job.workspaceId;
    const [workspace] = await tx
      .select({
        name: organization.name,
        slug: organization.slug,
      })
      .from(organization)
      .where(eq(organization.id, workspaceId))
      .limit(1);

    if (!workspace) {
      throw new Error("Workspace could not be resolved.");
    }

    const [existingCandidate] = await tx
      .select()
      .from(candidates)
      .where(
        and(
          eq(candidates.workspaceId, workspaceId),
          sql`lower(${candidates.email}) = ${values.email}`,
        ),
      )
      .limit(1);

    const candidate = existingCandidate
      ? (
          await tx
            .update(candidates)
            .set({
              firstName: values.firstName,
              lastName: values.lastName,
              phone: values.phone,
              location: values.location,
              linkedinUrl: values.linkedinUrl,
              githubUrl: values.githubUrl,
              websiteUrl: values.websiteUrl,
              updatedAt: new Date(),
            })
            .where(eq(candidates.id, existingCandidate.id))
            .returning()
        )[0]
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
            })
            .returning()
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
      return {
        ok: false,
        message: "You've already applied to this job",
      };
    }

    const [firstStage] = await tx
      .select({ id: jobStages.id })
      .from(jobStages)
      .where(
        and(
          eq(jobStages.workspaceId, workspaceId),
          eq(jobStages.jobId, job.id),
        ),
      )
      .orderBy(asc(jobStages.order))
      .limit(1);

    if (!firstStage) {
      return {
        ok: false,
        message: "This job is not accepting applications yet.",
      };
    }

    const now = new Date();
    const [nextPipelineOrder] = await tx
      .select({
        value: sql<number>`coalesce(max(${applications.pipelineOrder}), 0) + 1`,
      })
      .from(applications)
      .where(
        and(
          eq(applications.workspaceId, workspaceId),
          eq(applications.currentStageId, firstStage.id),
        ),
      );
    const [application] = await tx
      .insert(applications)
      .values({
        workspaceId,
        candidateId: candidate.id,
        jobId: job.id,
        currentStageId: firstStage.id,
        pipelineOrder: nextPipelineOrder?.value ?? 1,
        source: "public_form",
        status: "active",
        appliedAt: now,
      })
      .returning({ id: applications.id });

    if (!application) {
      throw new Error("Application could not be created.");
    }

    if (
      values.resumeUrl &&
      values.resumeFileName &&
      values.resumeFileType &&
      values.resumeFileSize
    ) {
      await tx.insert(candidateFiles).values({
        workspaceId,
        candidateId: candidate.id,
        fileName: values.resumeFileName,
        fileUrl: values.resumeUrl,
        fileType: values.resumeFileType,
        fileSize: values.resumeFileSize,
        uploadedById: null,
      });
    }

    await tx.insert(applicationStageHistory).values({
      workspaceId,
      applicationId: application.id,
      fromStageId: null,
      toStageId: firstStage.id,
      movedById: null,
    });

    const persistedQuestions = await tx
      .select({
        dbId: applicationQuestions.id,
        id: applicationQuestions.key,
        label: applicationQuestions.label,
        type: applicationQuestions.type,
        required: applicationQuestions.required,
      })
      .from(applicationQuestions)
      .where(
        and(
          eq(applicationQuestions.workspaceId, workspaceId),
          eq(applicationQuestions.jobId, job.id),
        ),
      )
      .orderBy(asc(applicationQuestions.order));
    const answersToInsert = buildQuestionAnswerRows({
      workspaceId,
      applicationId: application.id,
      questions: persistedQuestions,
      answers: values.questionAnswers,
    }).filter((row) => row.answer.length > 0);

    if (answersToInsert.length > 0) {
      await tx.insert(applicationAnswers).values(answersToInsert);
    }

    await tx.insert(activityEvents).values({
      workspaceId,
      actorId: null,
      entityType: "application",
      entityId: application.id,
      type: "application.created",
      metadata: {
        jobTitle: job.title,
        candidateName: `${candidate.firstName} ${candidate.lastName}`,
        resumeFileName: values.resumeFileName ?? null,
        resumeKey: values.resumeKey ?? null,
        questionAnswers: values.questionAnswers,
      },
    });

    const owners = await tx
      .select({ email: authUsers.email })
      .from(authMembers)
      .innerJoin(authUsers, eq(authUsers.id, authMembers.userId))
      .where(
        and(
          eq(authMembers.organizationId, workspaceId),
          eq(authMembers.role, "owner"),
        ),
      );

    return {
      ok: true,
      email: {
        candidateEmail: candidate.email,
        candidateFirstName: candidate.firstName,
        candidateName: `${candidate.firstName} ${candidate.lastName}`,
        jobTitle: job.title,
        workspaceName: workspace.name,
        workspaceSlug: workspace.slug,
        ownerEmails: owners.map((owner) => owner.email),
      },
    };
  });
}
