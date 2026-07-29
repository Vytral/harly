import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@harly/db";
import {
  activityEvents,
  applicationAnswers,
  applicationQuestions,
  applications,
  applicationStageHistory,
  candidates,
  candidateFiles,
  consentRecords,
  jobs,
  jobStages,
  member as authMembers,
  organization,
  user as authUsers,
  workspaceSettings,
} from "@harly/db";
import type {
  CandidateEducationEntry,
  CandidateExperienceEntry,
} from "@harly/db";
import { normalizeJobApplicationConfig } from "@/features/jobs/config";
import { buildQuestionAnswerRows } from "@/features/applications/questions";
import { emitWebhookEvent } from "@/server/webhooks/emit";
import {
  persistDomainEvent,
  publishPersistedDomainEvents,
  type PersistedDomainEvent,
} from "@/server/events/emit";
import type { ApplicationFormValues } from "@/lib/validations/applications";
import { isWorkspaceStorageKey } from "@/lib/storage-validation";
import { publicJobVisibilityConditions } from "@/features/jobs/data";

export type PublicApplicationResult =
  | {
      ok: true;
      applicationId: string;
      candidateId: string;
      email: {
        candidateEmail: string;
        candidateFirstName: string;
        candidateName: string;
        jobTitle: string;
        workspaceId: string;
        workspaceName: string;
        workspaceSlug: string;
        portalEnabled: boolean;
        applicationId: string;
        ownerEmails: string[];
      };
    }
  | { ok: false; message: string };

function normalizeEducationEntries(
  entries: ApplicationFormValues["educationEntries"],
): CandidateEducationEntry[] {
  return entries.map((entry) => ({
    id: entry.id,
    school: entry.school,
    degree: entry.degree ?? null,
    field: entry.field ?? null,
    startDate: entry.startDate ?? null,
    endDate: entry.endDate ?? null,
    description: entry.description ?? null,
  }));
}

function normalizeExperienceEntries(
  entries: ApplicationFormValues["experienceEntries"],
): CandidateExperienceEntry[] {
  return entries.map((entry) => ({
    id: entry.id,
    company: entry.company,
    title: entry.title,
    startDate: entry.startDate ?? null,
    endDate: entry.current ? null : (entry.endDate ?? null),
    current: entry.current ?? null,
    location: entry.location ?? null,
    description: entry.description ?? null,
  }));
}

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
        publicJobVisibilityConditions(),
        input.workspaceSlug
          ? eq(organization.slug, input.workspaceSlug)
          : undefined,
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
  options?: {
    consent?: {
      consentText: string;
      ipAddress: string | null;
      userAgent: string | null;
    } | null;
  },
): Promise<PublicApplicationResult> {
  // Captured inside the transaction, emitted after commit so a failed webhook
  // can never roll back a successful application.
  type CreatedEvent = {
    workspaceId: string;
    applicationId: string;
    candidateId: string;
    jobId: string;
    jobTitle: string;
    candidateEmail: string;
    candidateName: string;
  };
  // Held in a ref object so the transaction closure can populate it without
  // tripping TypeScript's "assigned-in-closure" narrowing of a bare `let`.
  const createdEvent: { current: CreatedEvent | null } = { current: null };
  const createdDomainEvent: { current: PersistedDomainEvent | null } = {
    current: null,
  };

  const result = await db.transaction(
    async (tx): Promise<PublicApplicationResult> => {
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
            publicJobVisibilityConditions(),
            input.workspaceSlug
              ? eq(organization.slug, input.workspaceSlug)
              : undefined,
          ),
        )
        .orderBy(desc(jobs.publishedAt), desc(jobs.createdAt))
        .limit(1);

      if (!job) {
        return { ok: false, message: "Job not available." };
      }

      const workspaceId = job.workspaceId;
      if (
        values.resumeKey &&
        !isWorkspaceStorageKey(workspaceId, values.resumeKey, "resumes")
      ) {
        return { ok: false, message: "Resume upload is invalid." };
      }
      const [workspace] = await tx
        .select({
          name: organization.name,
          slug: organization.slug,
          portalEnabled: workspaceSettings.candidatePortalEnabled,
        })
        .from(organization)
        .leftJoin(
          workspaceSettings,
          eq(workspaceSettings.organizationId, organization.id),
        )
        .where(eq(organization.id, workspaceId))
        .limit(1);

      if (!workspace) {
        throw new Error("Workspace could not be resolved.");
      }

      const submittedAddress = values.address ?? values.location ?? null;
      const educationEntries = normalizeEducationEntries(
        values.educationEntries,
      );
      const experienceEntries = normalizeExperienceEntries(
        values.experienceEntries,
      );

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

      if (existingCandidate?.deletedAt) {
        return {
          ok: false,
          message: "This candidate profile is no longer available.",
        };
      }

      // A duplicate application must be rejected before updating an existing
      // candidate. A retry should never overwrite contact/profile fields just
      // because the application itself is not accepted.
      if (existingCandidate) {
        const [duplicateApplication] = await tx
          .select({ id: applications.id })
          .from(applications)
          .where(
            and(
              eq(applications.workspaceId, workspaceId),
              eq(applications.candidateId, existingCandidate.id),
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
      }

      const candidate = existingCandidate
        ? (
            await tx
              .update(candidates)
              .set({
                firstName: values.firstName,
                lastName: values.lastName,
                phone: values.phone,
                address: submittedAddress,
                linkedinUrl: values.linkedinUrl,
                githubUrl: values.githubUrl,
                websiteUrl: values.websiteUrl,
                avatarUrl: values.photoUrl,
                headline: values.headline,
                educationEntries,
                experienceEntries,
                ...(values.skills && values.skills.length > 0
                  ? { skills: values.skills }
                  : {}),
                ...(values.experienceYears != null
                  ? { experienceYears: values.experienceYears }
                  : {}),
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
                address: submittedAddress,
                linkedinUrl: values.linkedinUrl,
                githubUrl: values.githubUrl,
                websiteUrl: values.websiteUrl,
                avatarUrl: values.photoUrl,
                headline: values.headline,
                educationEntries,
                experienceEntries,
                skills: values.skills ?? [],
                experienceYears: values.experienceYears ?? null,
              })
              .returning()
          )[0];

      if (!candidate) {
        throw new Error("Candidate could not be created.");
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
          coverLetter: values.coverLetter ?? null,
          snapshot: {
            phone: values.phone ?? null,
            address: submittedAddress,
            photoUrl: values.photoUrl ?? null,
            headline: values.headline ?? null,
            linkedinUrl: values.linkedinUrl ?? null,
            githubUrl: values.githubUrl ?? null,
            websiteUrl: values.websiteUrl ?? null,
            coverLetter: values.coverLetter ?? null,
            educationEntries,
            experienceEntries,
            resumeUrl: values.resumeUrl ?? null,
            resumeFileName: values.resumeFileName ?? null,
            resumeFileType: values.resumeFileType ?? null,
            resumeFileSize: values.resumeFileSize ?? null,
          },
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

      // Persist consent record (GDPR Art. 7 , proof of consent).
      if (options?.consent) {
        await tx.insert(consentRecords).values({
          workspaceId,
          candidateId: candidate.id,
          applicationId: application.id,
          consentType: "data_processing",
          consentText: options.consent.consentText,
          granted: true,
          ipAddress: options.consent.ipAddress,
          userAgent: options.consent.userAgent,
        });
      }

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

      createdEvent.current = {
        workspaceId,
        applicationId: application.id,
        candidateId: candidate.id,
        jobId: job.id,
        jobTitle: job.title,
        candidateEmail: candidate.email,
        candidateName: `${candidate.firstName} ${candidate.lastName}`,
      };
      createdDomainEvent.current = await persistDomainEvent(tx, {
        name: "application.created",
        workspaceId,
        aggregateType: "application",
        aggregateId: application.id,
        payload: {
          application: { id: application.id, jobId: job.id },
          candidate: { id: candidate.id, email: candidate.email },
          job: { id: job.id, title: job.title },
        },
      });

      return {
        ok: true,
        applicationId: application.id,
        candidateId: candidate.id,
        email: {
          candidateEmail: candidate.email,
          candidateFirstName: candidate.firstName,
          candidateName: `${candidate.firstName} ${candidate.lastName}`,
          jobTitle: job.title,
          workspaceId,
          workspaceName: workspace.name,
          workspaceSlug: workspace.slug,
          portalEnabled: workspace.portalEnabled === true,
          applicationId: application.id,
          ownerEmails: owners.map((owner) => owner.email),
        },
      };
    },
  );

  const event = createdEvent.current;
  if (createdDomainEvent.current) {
    await publishPersistedDomainEvents([createdDomainEvent.current]);
  }
  if (event) {
    await emitWebhookEvent(event.workspaceId, "application.created", {
      application: { id: event.applicationId, jobId: event.jobId },
      candidate: {
        id: event.candidateId,
        email: event.candidateEmail,
        name: event.candidateName,
      },
      job: { id: event.jobId, title: event.jobTitle },
    }, { skipDomainEvent: true });
  }

  return result;
}
