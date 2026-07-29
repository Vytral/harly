import "server-only";

import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";

import { db } from "@harly/db";
import {
  activityEvents,
  aiEvaluations,
  applicationAnswers,
  applications,
  applicationQuestions,
  candidates,
  candidateFiles,
  candidateNotes,
  candidateTags,
  candidateMessages,
  candidatePortalMagicLinks,
  documentAssociations,
  documentLegalHolds,
  documentRequests,
  documentVersions,
  documents,
  domainEventOutbox,
  dsarRequests,
  emailOutbox,
  interviews,
  jobs,
  jobStages,
  mailAttachments,
  mailMessages,
  mailIdempotencyKeys,
  mailUnificationMigrations,
  mailThreads,
  poolEntries,
  scorecards,
  offers,
  savedSignatures,
  signatureEnvelopes,
  signatureArtifacts,
  slackDeliveries,
  notifications,
  tasks,
  webhookDeliveries,
  user as authUsers,
} from "@harly/db";
import type {
  CandidateEducationEntry,
  CandidateExperienceEntry,
} from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { deleteConversationsForCandidate } from "@/features/ai-chat/data";
import {
  interviewTypeLabel,
  interviewModeLabel,
} from "@/features/interviews/shared";
import type {
  InterviewType,
  InterviewMode,
} from "@/features/interviews/shared";
import { cancelInterviewGCalEvent } from "@/lib/gcal/sync";
import { cancelInterviewTeamsMeeting } from "@/lib/outlook/teams-sync";
import { cancelInterviewZoomMeeting } from "@/lib/zoom/sync";
import { cancelInterviewJitsiMeeting } from "@/lib/jitsi/sync";
import { getWorkspaceCalConfig } from "@/lib/cal/config";
import { cancelCalBooking } from "@/lib/cal/client";
import { getWorkspaceEsignConfig } from "@/lib/esign/config";
import { archiveSubmissionIdempotent } from "@/lib/esign/client";
import { storage } from "@/lib/storage";
import { isWorkspaceStorageKey } from "@/lib/storage-validation";
import { resumeKeyFromUrl } from "@/lib/resume/storage-key";
import { isMailUnificationEnabled } from "@/lib/mail/feature-flag";

export type CandidateApplicationStatus =
  | "active"
  | "hired"
  | "rejected"
  | "withdrawn";

export type CandidateListItem = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string | null;
  location: string | null;
  avatarUrl: string | null;
  githubUrl: string | null;
  applicationCount: number;
  inPool: boolean;
  hasOpenPrivacyRequest: boolean;
  latestApplication: {
    applicationId: string;
    jobId: string;
    jobTitle: string;
    department: string | null;
    currentStageName: string | null;
    status: CandidateApplicationStatus;
    source: string | null;
    appliedAt: Date;
  } | null;
};

export type NoteMention = { userId: string; name: string };

export type AiEvaluationCriterion = {
  label: string;
  score: number;
  evidence: string | null;
};

export type CandidateAiEvaluationItem = {
  id: string;
  applicationId: string;
  source: "ai" | "rules";
  engineVersion: string;
  rubricVersion: string;
  evidenceCoverage: number | null;
  confidence: number | null;
  requiresHumanReview: boolean;
  provider: string;
  modelId: string;
  score: number;
  recommendation: "strong_yes" | "yes" | "maybe" | "no";
  summary: string;
  strengths: string[];
  gaps: string[];
  criteria: AiEvaluationCriterion[];
  usedResume: boolean;
  updatedAt: string;
};

export type CandidateNoteItem = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  authorEmail: string;
  mentions: NoteMention[];
};

export type CandidateApplicationAnswerItem = {
  id: string;
  label: string;
  type: string;
  answer: string;
};

export type CandidateActivityItem = {
  id: string;
  type: string;
  label: string;
  actorName: string | null;
  createdAt: Date;
};

export type CandidatePrivacyRequestItem = {
  id: string;
  type: "export" | "erasure";
  status: "pending" | "processing" | "blocked" | "completed" | "denied";
  requestedBy: string | null;
  processedBy: string | null;
  notes: string | null;
  blockedReason: string | null;
  blockedAt: Date | null;
  reviewDueAt: Date | null;
  createdAt: Date;
  completedAt: Date | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textFromMetadata(value: unknown, key: string) {
  if (!isRecord(value)) {
    return null;
  }

  const entry = value[key];
  return typeof entry === "string" ? entry : null;
}

export function workspaceStorageKeyFromUrl(
  workspaceId: string,
  fileUrl: string,
) {
  const resumeKey = resumeKeyFromUrl(fileUrl);
  if (resumeKey && isWorkspaceStorageKey(workspaceId, resumeKey, "resumes")) {
    return resumeKey;
  }

  const path = fileUrl.startsWith("/")
    ? fileUrl
    : (() => {
        try {
          return new URL(fileUrl).pathname;
        } catch {
          return fileUrl;
        }
      })();
  const marker = path.indexOf("workspaces/");
  const key = marker >= 0 ? path.slice(marker) : null;
  return key && isWorkspaceStorageKey(workspaceId, key, "images") ? key : null;
}

export async function listCandidates() {
  const { organization: workspace } = await getWorkspaceContext();

  const rows = await db
    .select({
      candidateId: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      email: candidates.email,
      phone: candidates.phone,
      location: sql<
        string | null
      >`coalesce(${candidates.address}, ${candidates.location})`,
      avatarUrl: candidates.avatarUrl,
      githubUrl: candidates.githubUrl,
      candidateCreatedAt: candidates.createdAt,
      candidateUpdatedAt: candidates.updatedAt,
      applicationId: applications.id,
      applicationJobId: applications.jobId,
      applicationStatus: applications.status,
      applicationSource: applications.source,
      appliedAt: applications.appliedAt,
      jobTitle: jobs.title,
      jobDepartment: jobs.department,
      currentStageName: jobStages.name,
    })
    .from(candidates)
    .leftJoin(
      applications,
      and(
        eq(applications.workspaceId, workspace.id),
        eq(applications.candidateId, candidates.id),
      ),
    )
    .leftJoin(
      jobs,
      and(eq(jobs.workspaceId, workspace.id), eq(jobs.id, applications.jobId)),
    )
    .leftJoin(
      jobStages,
      and(
        eq(jobStages.workspaceId, workspace.id),
        eq(jobStages.id, applications.currentStageId),
      ),
    )
    .where(
      and(
        eq(candidates.workspaceId, workspace.id),
        isNull(candidates.deletedAt),
      ),
    )
    .orderBy(desc(candidates.createdAt), desc(applications.appliedAt));

  const candidateMap = new Map<
    string,
    CandidateListItem & { createdAt: Date; updatedAt: Date }
  >();

  for (const row of rows) {
    const existing = candidateMap.get(row.candidateId);
    const candidate = existing ?? {
      id: row.candidateId,
      firstName: row.firstName,
      lastName: row.lastName,
      fullName: `${row.firstName} ${row.lastName}`,
      email: row.email,
      phone: row.phone,
      location: row.location,
      avatarUrl: row.avatarUrl,
      githubUrl: row.githubUrl,
      applicationCount: 0,
      inPool: false,
      hasOpenPrivacyRequest: false,
      latestApplication: null,
      createdAt: row.candidateCreatedAt,
      updatedAt: row.candidateUpdatedAt,
    };

    if (row.applicationId) {
      candidate.applicationCount += 1;

      if (
        row.jobTitle &&
        row.applicationJobId &&
        row.appliedAt &&
        row.applicationStatus &&
        (!candidate.latestApplication ||
          row.appliedAt > candidate.latestApplication.appliedAt)
      ) {
        candidate.latestApplication = {
          applicationId: row.applicationId,
          jobId: row.applicationJobId,
          jobTitle: row.jobTitle,
          department: row.jobDepartment ?? null,
          currentStageName: row.currentStageName,
          status: row.applicationStatus,
          source: row.applicationSource ?? null,
          appliedAt: row.appliedAt,
        };
      }
    }

    candidateMap.set(row.candidateId, candidate);
  }

  // Tags for every candidate in the workspace, grouped by candidate.
  const tagRows = await db
    .select({
      candidateId: candidateTags.candidateId,
      label: candidateTags.label,
    })
    .from(candidateTags)
    .where(eq(candidateTags.workspaceId, workspace.id))
    .orderBy(candidateTags.label);

  const tagsByCandidate = new Map<string, string[]>();
  for (const tag of tagRows) {
    const existing = tagsByCandidate.get(tag.candidateId) ?? [];
    existing.push(tag.label);
    tagsByCandidate.set(tag.candidateId, existing);
  }

  const candidateIds = Array.from(candidateMap.keys());
  const activePoolRows =
    candidateIds.length > 0
      ? await db
          .select({ candidateId: poolEntries.candidateId })
          .from(poolEntries)
          .where(
            and(
              eq(poolEntries.workspaceId, workspace.id),
              isNull(poolEntries.removedAt),
              inArray(poolEntries.candidateId, candidateIds),
            ),
          )
      : [];
  const inPoolIds = new Set(activePoolRows.map((row) => row.candidateId));

  const openPrivacyRows =
    candidateIds.length > 0
      ? await db
          .select({ candidateId: dsarRequests.candidateId })
          .from(dsarRequests)
          .where(
            and(
              eq(dsarRequests.workspaceId, workspace.id),
              inArray(dsarRequests.status, [
                "pending",
                "processing",
                "blocked",
              ]),
              inArray(dsarRequests.candidateId, candidateIds),
            ),
          )
      : [];
  const openPrivacyRequestIds = new Set(
    openPrivacyRows
      .map((row) => row.candidateId)
      .filter((id): id is string => Boolean(id)),
  );

  return Array.from(candidateMap.values())
    .sort(
      (first, second) => second.createdAt.getTime() - first.createdAt.getTime(),
    )
    .map((candidate) => ({
      id: candidate.id,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      fullName: candidate.fullName,
      email: candidate.email,
      phone: candidate.phone,
      location: candidate.location,
      avatarUrl: candidate.avatarUrl,
      githubUrl: candidate.githubUrl,
      updatedAt: candidate.updatedAt,
      applicationCount: candidate.applicationCount,
      inPool: inPoolIds.has(candidate.id),
      hasOpenPrivacyRequest: openPrivacyRequestIds.has(candidate.id),
      latestApplication: candidate.latestApplication,
      tags: tagsByCandidate.get(candidate.id) ?? [],
    }));
}

export async function getCandidateProfile(candidateId: string) {
  const { organization: workspace } = await getWorkspaceContext();

  const [candidate] = await db
    .select()
    .from(candidates)
    .where(
      and(
        eq(candidates.workspaceId, workspace.id),
        eq(candidates.id, candidateId),
      ),
    )
    .limit(1);

  if (!candidate) {
    return null;
  }

  const educationEntries = Array.isArray(candidate.educationEntries)
    ? (candidate.educationEntries as CandidateEducationEntry[])
    : [];
  const experienceEntries = Array.isArray(candidate.experienceEntries)
    ? (candidate.experienceEntries as CandidateExperienceEntry[])
    : [];

  const candidateApplications = await db
    .select({
      id: applications.id,
      workspaceId: applications.workspaceId,
      jobId: applications.jobId,
      jobTitle: jobs.title,
      currentStageId: applications.currentStageId,
      currentStageName: jobStages.name,
      status: applications.status,
      appliedAt: applications.appliedAt,
      source: applications.source,
    })
    .from(applications)
    .innerJoin(
      jobs,
      and(eq(jobs.workspaceId, workspace.id), eq(jobs.id, applications.jobId)),
    )
    .leftJoin(
      jobStages,
      and(
        eq(jobStages.workspaceId, workspace.id),
        eq(jobStages.id, applications.currentStageId),
      ),
    )
    .where(
      and(
        eq(applications.workspaceId, workspace.id),
        eq(applications.candidateId, candidate.id),
      ),
    )
    .orderBy(desc(applications.appliedAt));

  const applicationIdsForAnswers = candidateApplications.map(
    (application) => application.id,
  );
  const answerRows =
    applicationIdsForAnswers.length > 0
      ? await db
          .select({
            id: applicationAnswers.id,
            applicationId: applicationAnswers.applicationId,
            label: applicationQuestions.label,
            type: applicationQuestions.type,
            answer: applicationAnswers.answer,
            order: applicationQuestions.order,
          })
          .from(applicationAnswers)
          .innerJoin(
            applicationQuestions,
            and(
              eq(applicationQuestions.workspaceId, workspace.id),
              eq(applicationQuestions.id, applicationAnswers.questionId),
            ),
          )
          .where(
            and(
              eq(applicationAnswers.workspaceId, workspace.id),
              inArray(
                applicationAnswers.applicationId,
                applicationIdsForAnswers,
              ),
            ),
          )
          .orderBy(applicationQuestions.order)
      : [];
  const answersByApplication = new Map<
    string,
    CandidateApplicationAnswerItem[]
  >();

  for (const answer of answerRows) {
    const existing = answersByApplication.get(answer.applicationId) ?? [];
    existing.push({
      id: answer.id,
      label: answer.label,
      type: answer.type,
      answer: answer.answer,
    });
    answersByApplication.set(answer.applicationId, existing);
  }

  const notes = await db
    .select({
      id: candidateNotes.id,
      body: candidateNotes.body,
      createdAt: candidateNotes.createdAt,
      authorName: authUsers.name,
      authorEmail: authUsers.email,
      mentions: candidateNotes.mentions,
    })
    .from(candidateNotes)
    .innerJoin(authUsers, eq(authUsers.id, candidateNotes.authorId))
    .where(
      and(
        eq(candidateNotes.workspaceId, workspace.id),
        eq(candidateNotes.candidateId, candidate.id),
      ),
    )
    .orderBy(desc(candidateNotes.createdAt));

  const files = await db
    .select({
      id: candidateFiles.id,
      fileName: candidateFiles.fileName,
      fileUrl: candidateFiles.fileUrl,
      fileType: candidateFiles.fileType,
      fileSize: candidateFiles.fileSize,
      contentHash: candidateFiles.contentHash,
      parsedSummary: candidateFiles.parsedSummary,
      parsedSkills: candidateFiles.parsedSkills,
      parsedEducation: candidateFiles.parsedEducation,
      parsedExperienceYears: candidateFiles.parsedExperienceYears,
      parsedExperience: candidateFiles.parsedExperience,
      parsedEducationItems: candidateFiles.parsedEducationItems,
      parsedAt: candidateFiles.parsedAt,
      createdAt: candidateFiles.createdAt,
      uploadedByName: authUsers.name,
      uploadedByEmail: authUsers.email,
    })
    .from(candidateFiles)
    .leftJoin(authUsers, eq(authUsers.id, candidateFiles.uploadedById))
    .where(
      and(
        eq(candidateFiles.workspaceId, workspace.id),
        eq(candidateFiles.candidateId, candidate.id),
      ),
    )
    .orderBy(desc(candidateFiles.createdAt));

  const scorecardRows = await db
    .select({
      id: scorecards.id,
      rating: scorecards.rating,
      comment: scorecards.comment,
      stageName: scorecards.stageName,
      authorName: authUsers.name,
      createdAt: scorecards.createdAt,
    })
    .from(scorecards)
    .leftJoin(authUsers, eq(authUsers.id, scorecards.authorId))
    .where(
      and(
        eq(scorecards.workspaceId, workspace.id),
        eq(scorecards.candidateId, candidate.id),
      ),
    )
    .orderBy(desc(scorecards.createdAt));

  const aiEvaluationRows = await db
    .select({
      id: aiEvaluations.id,
      applicationId: aiEvaluations.applicationId,
      source: aiEvaluations.source,
      engineVersion: aiEvaluations.engineVersion,
      rubricVersion: aiEvaluations.rubricVersion,
      evidenceCoverage: aiEvaluations.evidenceCoverage,
      confidence: aiEvaluations.confidence,
      requiresHumanReview: aiEvaluations.requiresHumanReview,
      provider: aiEvaluations.provider,
      modelId: aiEvaluations.modelId,
      score: aiEvaluations.score,
      recommendation: aiEvaluations.recommendation,
      summary: aiEvaluations.summary,
      strengths: aiEvaluations.strengths,
      gaps: aiEvaluations.gaps,
      criteria: aiEvaluations.criteria,
      usedResume: aiEvaluations.usedResume,
      updatedAt: aiEvaluations.updatedAt,
    })
    .from(aiEvaluations)
    .where(
      and(
        eq(aiEvaluations.workspaceId, workspace.id),
        eq(aiEvaluations.candidateId, candidate.id),
      ),
    )
    .orderBy(desc(aiEvaluations.updatedAt));

  const tagRows = await db
    .select({ id: candidateTags.id, label: candidateTags.label })
    .from(candidateTags)
    .where(
      and(
        eq(candidateTags.workspaceId, workspace.id),
        eq(candidateTags.candidateId, candidate.id),
      ),
    )
    .orderBy(candidateTags.label);

  const mailUnificationEnabled = await isMailUnificationEnabled(workspace.id);
  const canonicalMessageRows = await db
    .select({
      id: mailMessages.id,
      direction: mailMessages.direction,
      subject: mailMessages.subject,
      body: mailMessages.textBody,
      toEmails: mailMessages.toEmails,
      fromEmail: mailMessages.fromEmail,
      source: mailThreads.source,
      createdAt: mailMessages.receivedAt,
      threadId: mailMessages.threadId,
      applicationId: mailMessages.applicationId,
      readAt: mailMessages.readAt,
    })
    .from(mailMessages)
    .innerJoin(
      mailThreads,
      and(
        eq(mailThreads.id, mailMessages.threadId),
        eq(mailThreads.workspaceId, workspace.id),
      ),
    )
    .where(
      and(
        eq(mailMessages.workspaceId, workspace.id),
        eq(mailMessages.candidateId, candidate.id),
      ),
    )
    .orderBy(desc(mailMessages.receivedAt));

  const messageAttachments = canonicalMessageRows.length
    ? await db
        .select({
          messageId: mailAttachments.messageId,
          filename: mailAttachments.filename,
          contentType: mailAttachments.contentType,
          size: mailAttachments.size,
          storageKey: mailAttachments.storageKey,
        })
        .from(mailAttachments)
        .where(
          and(
            eq(mailAttachments.workspaceId, workspace.id),
            inArray(
              mailAttachments.messageId,
              canonicalMessageRows.map((message) => message.id),
            ),
          ),
        )
    : [];
  const attachmentsByMessage = new Map<string, typeof messageAttachments>();
  for (const attachment of messageAttachments) {
    const list = attachmentsByMessage.get(attachment.messageId) ?? [];
    list.push(attachment);
    attachmentsByMessage.set(attachment.messageId, list);
  }
  const legacyMessageRows = !mailUnificationEnabled
    ? await db
        .select()
        .from(candidateMessages)
        .where(
          and(
            eq(candidateMessages.workspaceId, workspace.id),
            eq(candidateMessages.candidateId, candidate.id),
          ),
        )
        .orderBy(desc(candidateMessages.createdAt))
    : [];
  const messageRows = mailUnificationEnabled
    ? canonicalMessageRows
    : legacyMessageRows.map((message) => ({
        id: message.id,
        direction: message.direction,
        subject: message.subject,
        body: message.body,
        toEmails: [message.toEmail],
        fromEmail: message.fromEmail,
        source: "provider" as const,
        createdAt: message.createdAt,
        threadId: null,
        applicationId: message.applicationId,
        readAt: message.readAt,
        legacyAttachments: Array.isArray(message.attachments)
          ? message.attachments
          : [],
      }));

  const applicationIds = candidateApplications.map(
    (application) => application.id,
  );

  const events =
    applicationIds.length > 0
      ? await db
          .select({
            id: activityEvents.id,
            entityType: activityEvents.entityType,
            entityId: activityEvents.entityId,
            type: activityEvents.type,
            metadata: activityEvents.metadata,
            actorName: authUsers.name,
            createdAt: activityEvents.createdAt,
          })
          .from(activityEvents)
          .leftJoin(authUsers, eq(authUsers.id, activityEvents.actorId))
          .where(
            and(
              eq(activityEvents.workspaceId, workspace.id),
              or(
                and(
                  eq(activityEvents.entityType, "candidate"),
                  eq(activityEvents.entityId, candidate.id),
                ),
                and(
                  eq(activityEvents.entityType, "application"),
                  inArray(activityEvents.entityId, applicationIds),
                ),
              ),
            ),
          )
          .orderBy(desc(activityEvents.createdAt), desc(activityEvents.id))
          .limit(500)
      : await db
          .select({
            id: activityEvents.id,
            entityType: activityEvents.entityType,
            entityId: activityEvents.entityId,
            type: activityEvents.type,
            metadata: activityEvents.metadata,
            actorName: authUsers.name,
            createdAt: activityEvents.createdAt,
          })
          .from(activityEvents)
          .leftJoin(authUsers, eq(authUsers.id, activityEvents.actorId))
          .where(
            and(
              eq(activityEvents.workspaceId, workspace.id),
              eq(activityEvents.entityType, "candidate"),
              eq(activityEvents.entityId, candidate.id),
            ),
          )
          .orderBy(desc(activityEvents.createdAt), desc(activityEvents.id))
          .limit(500);

  const applicationJobTitles = new Map(
    candidateApplications.map((application) => [
      application.id,
      application.jobTitle,
    ]),
  );
  const stageIds = events
    .map((event) => textFromMetadata(event.metadata, "toStageId"))
    .filter((stageId): stageId is string => Boolean(stageId));
  const stageRows =
    stageIds.length > 0
      ? await db
          .select({ id: jobStages.id, name: jobStages.name })
          .from(jobStages)
          .where(
            and(
              eq(jobStages.workspaceId, workspace.id),
              inArray(jobStages.id, stageIds),
            ),
          )
      : [];
  const stageNames = new Map(stageRows.map((stage) => [stage.id, stage.name]));

  const activity: CandidateActivityItem[] = events.map((event) => {
    if (event.type === "application.created") {
      const jobTitle = applicationJobTitles.get(event.entityId) ?? "a job";
      const source = textFromMetadata(event.metadata, "source");
      return {
        id: event.id,
        type: event.type,
        label:
          source === "csv_import"
            ? `Added to ${jobTitle} via CSV import`
            : `Applied to ${jobTitle}`,
        actorName: event.actorName,
        createdAt: event.createdAt,
      };
    }

    if (event.type === "stage.changed") {
      const toStageId = textFromMetadata(event.metadata, "toStageId");
      return {
        id: event.id,
        type: event.type,
        label: `Moved to ${toStageId ? (stageNames.get(toStageId) ?? "another stage") : "another stage"}`,
        actorName: event.actorName,
        createdAt: event.createdAt,
      };
    }

    if (event.type === "note.added") {
      return {
        id: event.id,
        type: event.type,
        label: "Note added",
        actorName: event.actorName,
        createdAt: event.createdAt,
      };
    }

    if (event.type === "note.mentioned") {
      const who = textFromMetadata(event.metadata, "mentionedName");
      return {
        id: event.id,
        type: event.type,
        label: who ? `Mentioned ${who}` : "Mentioned a teammate",
        actorName: event.actorName,
        createdAt: event.createdAt,
      };
    }

    if (event.type === "candidate.updated") {
      return {
        id: event.id,
        type: event.type,
        label: "Profile updated",
        actorName: event.actorName,
        createdAt: event.createdAt,
      };
    }

    if (event.type === "file.uploaded") {
      return {
        id: event.id,
        type: event.type,
        label: `File uploaded${textFromMetadata(event.metadata, "fileName") ? `: ${textFromMetadata(event.metadata, "fileName")}` : ""}`,
        actorName: event.actorName,
        createdAt: event.createdAt,
      };
    }

    if (event.type === "application.hired") {
      return {
        id: event.id,
        type: event.type,
        label: "Marked as hired",
        actorName: event.actorName,
        createdAt: event.createdAt,
      };
    }

    if (
      event.type === "evaluation.ai_generated" ||
      event.type === "evaluation.rules_generated"
    ) {
      const score =
        event.metadata && typeof event.metadata === "object"
          ? (event.metadata as Record<string, unknown>).score
          : null;
      const source =
        event.metadata && typeof event.metadata === "object"
          ? (event.metadata as Record<string, unknown>).source
          : null;
      return {
        id: event.id,
        type: event.type,
        label: `${source === "rules" || event.type === "evaluation.rules_generated" ? "Automatic evaluation generated" : "AI evaluation generated"}${typeof score === "number" ? ` · ${score}/100` : ""}`,
        actorName: event.actorName,
        createdAt: event.createdAt,
      };
    }

    if (event.type === "application.rejected") {
      return {
        id: event.id,
        type: event.type,
        label: "Marked as rejected",
        actorName: event.actorName,
        createdAt: event.createdAt,
      };
    }

    if (event.type.startsWith("interview.")) {
      const interviewLabels: Record<string, string> = {
        "interview.scheduled": "Interview scheduled",
        "interview.canceled": "Interview canceled",
        "interview.completed": "Interview completed",
        "interview.rescheduled": "Interview rescheduled",
      };
      const meta = isRecord(event.metadata) ? event.metadata : null;
      const interviewType =
        meta && typeof meta.type === "string"
          ? (meta.type as InterviewType)
          : null;
      const interviewMode =
        meta && typeof meta.mode === "string"
          ? (meta.mode as InterviewMode)
          : null;
      const typeLabel = interviewType
        ? interviewTypeLabel(interviewType)
        : null;
      const modeLabel = interviewMode
        ? interviewModeLabel(interviewMode)
        : null;
      const suffix = [typeLabel, modeLabel].filter(Boolean).join(" · ");
      return {
        id: event.id,
        type: event.type,
        label: `${interviewLabels[event.type] ?? event.type}${suffix ? `, ${suffix}` : ""}`,
        actorName: event.actorName,
        createdAt: event.createdAt,
      };
    }

    if (event.type.startsWith("offer.")) {
      const offerLabels: Record<string, string> = {
        "offer.created": "Offer drafted",
        "offer.sent": "Offer sent",
        "offer.accepted": "Offer accepted",
        "offer.declined": "Offer declined",
        "offer.withdrawn": "Offer withdrawn",
      };
      const title = textFromMetadata(event.metadata, "title");
      return {
        id: event.id,
        type: event.type,
        label: `${offerLabels[event.type] ?? event.type}${title ? `, ${title}` : ""}`,
        actorName: event.actorName,
        createdAt: event.createdAt,
      };
    }

    if (event.type.startsWith("document.")) {
      const documentLabels: Record<string, string> = {
        "document.requested": "Documents requested",
        "document.submitted": "Document submitted",
        "document.uploaded": "Document added",
        "document.signature_sent": "Sent for signature",
        "document.signature_changed": "Signature status changed",
        "document.signature_voided": "Signature request voided",
        "document.expired": "Document expired",
      };
      const title = textFromMetadata(event.metadata, "title");
      return {
        id: event.id,
        type: event.type,
        label: `${documentLabels[event.type] ?? "Document activity"}${title ? `, ${title}` : ""}`,
        actorName: event.actorName,
        createdAt: event.createdAt,
      };
    }

    if (event.type === "candidate.anonymized") {
      return {
        id: event.id,
        type: event.type,
        label: "Candidate data anonymized (retention policy)",
        actorName: event.actorName,
        createdAt: event.createdAt,
      };
    }

    return {
      id: event.id,
      type: event.type,
      label: event.type,
      actorName: event.actorName,
      createdAt: event.createdAt,
    };
  });

  // Check if candidate is in the pool
  const [poolEntry] = await db
    .select({ id: poolEntries.id })
    .from(poolEntries)
    .where(
      and(
        eq(poolEntries.workspaceId, workspace.id),
        eq(poolEntries.candidateId, candidate.id),
        isNull(poolEntries.removedAt),
      ),
    )
    .limit(1);

  const inPool = !!poolEntry;

  const privacyRequests = await db
    .select({
      id: dsarRequests.id,
      type: dsarRequests.type,
      status: dsarRequests.status,
      requestedBy: dsarRequests.requestedBy,
      processedBy: dsarRequests.processedBy,
      notes: dsarRequests.notes,
      blockedReason: dsarRequests.blockedReason,
      blockedAt: dsarRequests.blockedAt,
      reviewDueAt: dsarRequests.reviewDueAt,
      createdAt: dsarRequests.createdAt,
      completedAt: dsarRequests.completedAt,
    })
    .from(dsarRequests)
    .where(
      and(
        eq(dsarRequests.workspaceId, workspace.id),
        eq(dsarRequests.candidateId, candidate.id),
      ),
    )
    .orderBy(desc(dsarRequests.createdAt));

  return {
    workspaceId: workspace.id,
    candidate: {
      ...candidate,
      location: candidate.address ?? candidate.location,
      educationEntries,
      experienceEntries,
    },
    inPool,
    applications: candidateApplications.map((application) => ({
      ...application,
      answers: answersByApplication.get(application.id) ?? [],
    })),
    notes: notes.map((note) => ({
      id: note.id,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
      authorName: note.authorName,
      authorEmail: note.authorEmail,
      mentions: Array.isArray(note.mentions)
        ? (note.mentions as NoteMention[])
        : [],
    })),
    files,
    activity,
    scorecards: scorecardRows.map((row) => ({
      id: row.id,
      rating: row.rating,
      comment: row.comment,
      stageName: row.stageName,
      authorName: row.authorName,
      createdAt: row.createdAt.toISOString(),
    })),
    aiEvaluations: aiEvaluationRows.map((row) => ({
      id: row.id,
      applicationId: row.applicationId,
      source: (row.source === "rules" ? "rules" : "ai") as "ai" | "rules",
      engineVersion: row.engineVersion,
      rubricVersion: row.rubricVersion,
      evidenceCoverage: row.evidenceCoverage,
      confidence: row.confidence,
      requiresHumanReview: row.requiresHumanReview,
      provider: row.provider,
      modelId: row.modelId,
      score: row.score,
      recommendation: row.recommendation,
      summary: row.summary,
      strengths: Array.isArray(row.strengths)
        ? (row.strengths as string[])
        : [],
      gaps: Array.isArray(row.gaps) ? (row.gaps as string[]) : [],
      criteria: Array.isArray(row.criteria)
        ? (row.criteria as AiEvaluationCriterion[])
        : [],
      usedResume: row.usedResume,
      updatedAt: row.updatedAt.toISOString(),
    })),
    tags: tagRows,
    privacyRequests,
    messages: messageRows.map((row) => ({
      id: row.id,
      threadId: row.threadId,
      applicationId: row.applicationId,
      direction: row.direction,
      transport: row.source,
      subject: row.subject,
      body: row.body,
      toEmail: Array.isArray(row.toEmails) ? String(row.toEmails[0] ?? "") : "",
      fromEmail: row.fromEmail,
      status: "sent" as const,
      read: row.readAt !== null,
      authorName: null,
      attachments: ("legacyAttachments" in row
        ? row.legacyAttachments
        : (attachmentsByMessage.get(row.id) ?? [])) as Array<{
        filename: string;
        contentType: string;
        size: number;
        storageKey: string;
      }>,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

export type TrashedCandidateItem = {
  id: string;
  fullName: string;
  email: string;
  githubUrl: string | null;
  deletedAt: Date;
};

/** Candidates moved to the trash (soft-deleted), most recently deleted first. */
export async function listTrashedCandidates(): Promise<TrashedCandidateItem[]> {
  const { organization: workspace } = await getWorkspaceContext();

  const rows = await db
    .select({
      id: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      email: candidates.email,
      githubUrl: candidates.githubUrl,
      deletedAt: candidates.deletedAt,
    })
    .from(candidates)
    .where(
      and(
        eq(candidates.workspaceId, workspace.id),
        isNotNull(candidates.deletedAt),
      ),
    )
    .orderBy(desc(candidates.deletedAt));

  return rows.map((row) => ({
    id: row.id,
    fullName: `${row.firstName} ${row.lastName}`,
    email: row.email,
    githubUrl: row.githubUrl,
    deletedAt: row.deletedAt as Date,
  }));
}

/** Move a candidate to the trash (soft delete) , reversible. */
export async function trashCandidate(candidateId: string) {
  const { organization: workspace } = await getWorkspaceContext();

  const [candidate] = await db
    .update(candidates)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(candidates.id, candidateId),
        eq(candidates.workspaceId, workspace.id),
        isNull(candidates.deletedAt),
      ),
    )
    .returning({ id: candidates.id });

  return candidate
    ? ({ ok: true } as const)
    : ({ ok: false, error: "Candidate not found." } as const);
}

/** Move multiple candidates to the trash (soft delete) , reversible. */
export async function trashCandidates(candidateIds: string[]) {
  const { organization: workspace } = await getWorkspaceContext();

  const rows = await db
    .update(candidates)
    .set({ deletedAt: new Date() })
    .where(
      and(
        inArray(candidates.id, candidateIds),
        eq(candidates.workspaceId, workspace.id),
        isNull(candidates.deletedAt),
      ),
    )
    .returning({ id: candidates.id });

  return { ok: true, count: rows.length } as const;
}

/** Restore a candidate out of the trash. */
export async function restoreCandidate(candidateId: string) {
  const { organization: workspace } = await getWorkspaceContext();

  const [candidate] = await db
    .update(candidates)
    .set({ deletedAt: null })
    .where(
      and(
        eq(candidates.id, candidateId),
        eq(candidates.workspaceId, workspace.id),
      ),
    )
    .returning({ id: candidates.id });

  return candidate
    ? ({ ok: true } as const)
    : ({ ok: false, error: "Candidate not found." } as const);
}

/** Permanently delete a trashed candidate and all related records (cascade). */
export async function permanentlyDeleteCandidate(
  candidateId: string,
  processedBy: string,
  workspaceId?: string,
) {
  const workspace = workspaceId
    ? { id: workspaceId }
    : (await getWorkspaceContext()).organization;

  const [candidate] = await db
    .select({ avatarUrl: candidates.avatarUrl, email: candidates.email })
    .from(candidates)
    .where(
      and(
        eq(candidates.id, candidateId),
        eq(candidates.workspaceId, workspace.id),
        isNotNull(candidates.deletedAt),
      ),
    )
    .limit(1);
  if (!candidate)
    return { ok: false, error: "Candidate not found in trash." } as const;
  const purgeStartedAt = Date.now();

  const applicationRows = await db
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.workspaceId, workspace.id),
        eq(applications.candidateId, candidateId),
      ),
    );
  const applicationIds = applicationRows.map((row) => row.id);

  // Candidate rows cascade-delete most ATS data, but several historical and
  // hub tables intentionally use SET NULL or have polymorphic links. Collect
  // those records explicitly so a deleted candidate cannot reappear in other
  // sections of the product.
  const [
    associatedDocuments,
    requestedDocuments,
    mailAttachmentRows,
    mailMessageRows,
    mailThreadRows,
    legacyMessageRows,
    candidateFileRows,
    candidateSignatureRows,
  ] = await Promise.all([
    db
      .select({ documentId: documentAssociations.documentId })
      .from(documentAssociations)
      .where(
        and(
          eq(documentAssociations.workspaceId, workspace.id),
          or(
            and(
              eq(documentAssociations.targetType, "candidate"),
              eq(documentAssociations.targetId, candidateId),
            ),
            applicationIds.length > 0
              ? and(
                  eq(documentAssociations.targetType, "application"),
                  inArray(documentAssociations.targetId, applicationIds),
                )
              : undefined,
          ),
        ),
      ),
    db
      .select({ documentId: documentRequests.documentId })
      .from(documentRequests)
      .where(
        and(
          eq(documentRequests.workspaceId, workspace.id),
          or(
            eq(documentRequests.candidateId, candidateId),
            applicationIds.length > 0
              ? inArray(documentRequests.applicationId, applicationIds)
              : undefined,
          ),
        ),
      ),
    db
      .select({
        messageId: mailAttachments.messageId,
        storageKey: mailAttachments.storageKey,
      })
      .from(mailAttachments)
      .innerJoin(
        mailMessages,
        and(
          eq(mailMessages.id, mailAttachments.messageId),
          eq(mailMessages.workspaceId, workspace.id),
        ),
      )
      .where(
        and(
          eq(mailAttachments.workspaceId, workspace.id),
          or(
            eq(mailMessages.candidateId, candidateId),
            applicationIds.length > 0
              ? inArray(mailMessages.applicationId, applicationIds)
              : undefined,
          ),
        ),
      ),
    db
      .select({ id: mailMessages.id, threadId: mailMessages.threadId })
      .from(mailMessages)
      .where(
        and(
          eq(mailMessages.workspaceId, workspace.id),
          or(
            eq(mailMessages.candidateId, candidateId),
            applicationIds.length > 0
              ? inArray(mailMessages.applicationId, applicationIds)
              : undefined,
          ),
        ),
      ),
    db
      .select({ id: mailThreads.id })
      .from(mailThreads)
      .where(
        and(
          eq(mailThreads.workspaceId, workspace.id),
          or(
            eq(mailThreads.candidateId, candidateId),
            applicationIds.length > 0
              ? inArray(mailThreads.applicationId, applicationIds)
              : undefined,
          ),
        ),
      ),
    db
      .select({
        id: candidateMessages.id,
        attachments: candidateMessages.attachments,
      })
      .from(candidateMessages)
      .where(
        and(
          eq(candidateMessages.workspaceId, workspace.id),
          eq(candidateMessages.candidateId, candidateId),
        ),
      ),
    db
      .select({ id: candidateFiles.id, fileUrl: candidateFiles.fileUrl })
      .from(candidateFiles)
      .where(
        and(
          eq(candidateFiles.workspaceId, workspace.id),
          eq(candidateFiles.candidateId, candidateId),
        ),
      ),
    db
      .select({ storageKey: savedSignatures.storageKey })
      .from(savedSignatures)
      .where(
        and(
          eq(savedSignatures.workspaceId, workspace.id),
          eq(savedSignatures.ownerType, "candidate"),
          eq(savedSignatures.ownerId, candidateId),
        ),
      ),
  ]);

  const documentIds = [
    ...associatedDocuments.map((row) => row.documentId),
    ...requestedDocuments.map((row) => row.documentId),
  ].filter((id): id is string => Boolean(id));
  const legacyCandidateFileIds = candidateFileRows.map((row) => row.id);
  const legacyDocuments =
    legacyCandidateFileIds.length > 0
      ? await db
          .select({ id: documents.id })
          .from(documents)
          .where(
            and(
              eq(documents.workspaceId, workspace.id),
              inArray(documents.legacyCandidateFileId, legacyCandidateFileIds),
            ),
          )
      : [];
  const uniqueDocumentIds = [
    ...new Set([...documentIds, ...legacyDocuments.map((row) => row.id)]),
  ];

  const [documentRows, versionRows, signatureArtifactRows, fileRows] =
    await Promise.all([
      uniqueDocumentIds.length > 0
        ? db
            .select({
              storageKey: documents.storageKey,
              signatureEnvelopeRefId: documents.signatureEnvelopeRefId,
            })
            .from(documents)
            .where(
              and(
                eq(documents.workspaceId, workspace.id),
                inArray(documents.id, uniqueDocumentIds),
              ),
            )
        : Promise.resolve([]),
      uniqueDocumentIds.length > 0
        ? db
            .select({ storageKey: documentVersions.storageKey })
            .from(documentVersions)
            .where(
              and(
                eq(documentVersions.workspaceId, workspace.id),
                inArray(documentVersions.documentId, uniqueDocumentIds),
              ),
            )
        : Promise.resolve([]),
      uniqueDocumentIds.length > 0
        ? db
            .select({ storageKey: signatureArtifacts.storageKey })
            .from(signatureArtifacts)
            .where(
              and(
                eq(signatureArtifacts.workspaceId, workspace.id),
                inArray(signatureArtifacts.documentId, uniqueDocumentIds),
              ),
            )
        : Promise.resolve([]),
      Promise.resolve(candidateFileRows),
    ]);

  const candidateOfferRows = await db
    .select({ signatureEnvelopeRefId: offers.signatureEnvelopeRefId })
    .from(offers)
    .where(
      and(
        eq(offers.workspaceId, workspace.id),
        or(
          eq(offers.candidateId, candidateId),
          applicationIds.length > 0
            ? inArray(offers.applicationId, applicationIds)
            : undefined,
        ),
      ),
    );
  const signatureEnvelopeIds = [
    ...new Set(
      [
        ...documentRows.map((row) => row.signatureEnvelopeRefId),
        ...candidateOfferRows.map((row) => row.signatureEnvelopeRefId),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
  const signatureEnvelopeRows =
    signatureEnvelopeIds.length > 0
      ? await db
          .select({
            id: signatureEnvelopes.id,
            provider: signatureEnvelopes.provider,
            providerEnvelopeId: signatureEnvelopes.providerEnvelopeId,
            status: signatureEnvelopes.status,
          })
          .from(signatureEnvelopes)
          .where(
            and(
              eq(signatureEnvelopes.workspaceId, workspace.id),
              inArray(signatureEnvelopes.id, signatureEnvelopeIds),
            ),
          )
      : [];

  const legacyAttachmentKeys = legacyMessageRows.flatMap((row) =>
    Array.isArray(row.attachments)
      ? row.attachments.flatMap((attachment) =>
          typeof attachment === "object" &&
          attachment !== null &&
          "storageKey" in attachment &&
          typeof attachment.storageKey === "string"
            ? [attachment.storageKey]
            : [],
        )
      : [],
  );

  const [heldDocument] =
    uniqueDocumentIds.length > 0
      ? await db
          .select({ id: documentLegalHolds.id })
          .from(documentLegalHolds)
          .where(inArray(documentLegalHolds.documentId, uniqueDocumentIds))
          .limit(1)
      : [];
  if (heldDocument) {
    return {
      ok: false,
      error:
        "This candidate has documents under legal hold and cannot be erased yet.",
    } as const;
  }

  // Candidate rows cascade-delete, but object storage does not. Remove every
  // workspace-owned resume, hub document, mail attachment, and avatar first;
  // fail closed if any object cannot be erased so the request can be retried.
  const storageKeys = new Set(
    [
      ...fileRows.map((file) => file.fileUrl),
      ...documentRows.map((file) => file.storageKey),
      ...versionRows.map((file) => file.storageKey),
      ...signatureArtifactRows.map((file) => file.storageKey),
      ...candidateSignatureRows.map((file) => file.storageKey),
      ...mailAttachmentRows.map((file) => file.storageKey),
      ...legacyAttachmentKeys.filter((key) =>
        key.startsWith(`mailboxes/${workspace.id}/`),
      ),
      candidate.avatarUrl,
    ]
      .filter((url): url is string => Boolean(url))
      .map((url) => workspaceStorageKeyFromUrl(workspace.id, url) ?? url)
      .filter(
        (key) =>
          key.startsWith(`workspaces/${workspace.id}/`) ||
          key.startsWith(`mailboxes/${workspace.id}/`),
      )
      .filter((key): key is string => Boolean(key)),
  );
  const storageResults = await Promise.allSettled(
    [...storageKeys].map((key) => storage.delete(key)),
  );
  if (storageResults.some((result) => result.status === "rejected")) {
    return {
      ok: false,
      error: "Could not erase every stored candidate file. Please retry.",
    } as const;
  }

  const activeExternalSignatures = signatureEnvelopeRows.filter(
    (row) => !["voided", "archived"].includes(row.status.toLowerCase()),
  );
  if (activeExternalSignatures.length > 0) {
    const esignConfig = await getWorkspaceEsignConfig(workspace.id);
    if (!esignConfig) {
      return {
        ok: false,
        error: "Could not reach the external signature provider. Please retry.",
      } as const;
    }
    const signatureResults = await Promise.all(
      activeExternalSignatures.map((row) =>
        row.provider.toLowerCase() === "docuseal"
          ? archiveSubmissionIdempotent(esignConfig, row.providerEnvelopeId)
          : Promise.resolve(false),
      ),
    );
    if (signatureResults.some((result) => !result)) {
      return {
        ok: false,
        error:
          "Could not cancel every external signature request. Please retry.",
      } as const;
    }
  }

  // Cancel any Google Calendar events for this candidate's interviews before
  // the cascade delete removes the rows (and we lose the gcalEventId refs).
  const linkedInterviews = await db
    .select({
      id: interviews.id,
      gcalEventId: interviews.gcalEventId,
      teamsMeetingId: interviews.teamsMeetingId,
      zoomMeetingId: interviews.zoomMeetingId,
      jitsiRoom: interviews.jitsiRoom,
      calBookingUid: interviews.calBookingUid,
    })
    .from(interviews)
    .where(
      and(
        eq(interviews.candidateId, candidateId),
        eq(interviews.workspaceId, workspace.id),
        or(
          isNotNull(interviews.gcalEventId),
          isNotNull(interviews.teamsMeetingId),
          isNotNull(interviews.zoomMeetingId),
          isNotNull(interviews.jitsiRoom),
          isNotNull(interviews.calBookingUid),
        ),
      ),
    );

  for (const iv of linkedInterviews) {
    const cancellations = [
      iv.gcalEventId
        ? cancelInterviewGCalEvent({
            workspaceId: workspace.id,
            interviewId: iv.id,
            gcalEventId: iv.gcalEventId,
          })
        : Promise.resolve(true),
      iv.teamsMeetingId
        ? cancelInterviewTeamsMeeting({
            workspaceId: workspace.id,
            interviewId: iv.id,
            teamsMeetingId: iv.teamsMeetingId,
          })
        : Promise.resolve(true),
      iv.zoomMeetingId
        ? cancelInterviewZoomMeeting({
            workspaceId: workspace.id,
            interviewId: iv.id,
            zoomMeetingId: iv.zoomMeetingId,
          })
        : Promise.resolve(true),
      iv.jitsiRoom
        ? cancelInterviewJitsiMeeting({
            workspaceId: workspace.id,
            interviewId: iv.id,
          })
        : Promise.resolve(true),
      iv.calBookingUid
        ? getWorkspaceCalConfig(workspace.id).then((config) =>
            config ? cancelCalBooking(config, iv.calBookingUid!) : false,
          )
        : Promise.resolve(true),
    ];
    const results = await Promise.all(cancellations);
    if (results.some((result) => !result)) {
      return {
        ok: false,
        error:
          "Could not cancel every external interview resource. Please retry.",
      } as const;
    }
  }

  // Erase the candidate's AI chat history (IA-02 / GDPR Art. 17). Conversations
  // linked via candidateId also cascade-delete their messages; this explicit
  // delete covers the same rows and is safe to run regardless.
  await deleteConversationsForCandidate(candidateId, workspace.id);

  const canonicalMessageIds = mailMessageRows.map((row) => row.id);
  const canonicalThreadIds = [
    ...new Set([
      ...mailThreadRows.map((row) => row.id),
      ...mailMessageRows.map((row) => row.threadId),
    ]),
  ];
  const legacyMessageIds = legacyMessageRows.map((row) => row.id);

  const now = new Date();
  const [deleted] = await db.transaction(async (tx) => {
    // Remove polymorphic/history rows before the candidate FK is gone. These
    // are the records that previously survived as orphaned traces.
    await tx
      .delete(activityEvents)
      .where(
        and(
          eq(activityEvents.workspaceId, workspace.id),
          or(
            and(
              eq(activityEvents.entityType, "candidate"),
              eq(activityEvents.entityId, candidateId),
            ),
            applicationIds.length > 0
              ? and(
                  eq(activityEvents.entityType, "application"),
                  inArray(activityEvents.entityId, applicationIds),
                )
              : undefined,
          ),
        ),
      );
    const relatedEntityIds = [candidateId, ...applicationIds];
    const relatedIdsPattern = relatedEntityIds.join("|");
    await tx
      .delete(tasks)
      .where(
        and(
          eq(tasks.workspaceId, workspace.id),
          or(
            eq(tasks.candidateId, candidateId),
            applicationIds.length > 0
              ? inArray(tasks.applicationId, applicationIds)
              : undefined,
          ),
        ),
      );
    await tx
      .delete(notifications)
      .where(
        and(
          eq(notifications.workspaceId, workspace.id),
          sql`coalesce(${notifications.metadata}::text, '') ~ ${relatedIdsPattern}`,
        ),
      );
    await tx
      .delete(emailOutbox)
      .where(
        and(
          eq(emailOutbox.workspaceId, workspace.id),
          sql`${emailOutbox.payload}::text ~ ${relatedIdsPattern}`,
        ),
      );
    await tx
      .delete(webhookDeliveries)
      .where(
        and(
          eq(webhookDeliveries.workspaceId, workspace.id),
          sql`${webhookDeliveries.payload}::text ~ ${relatedIdsPattern}`,
        ),
      );
    await tx
      .delete(slackDeliveries)
      .where(
        and(
          eq(slackDeliveries.workspaceId, workspace.id),
          sql`${slackDeliveries.payload}::text ~ ${relatedIdsPattern}`,
        ),
      );
    await tx
      .delete(domainEventOutbox)
      .where(
        and(
          eq(domainEventOutbox.workspaceId, workspace.id),
          or(
            inArray(domainEventOutbox.aggregateId, relatedEntityIds),
            sql`${domainEventOutbox.payload}::text ~ ${relatedIdsPattern}`,
          ),
        ),
      );
    if (legacyMessageIds.length > 0 || canonicalMessageIds.length > 0) {
      await tx
        .delete(mailUnificationMigrations)
        .where(
          and(
            eq(mailUnificationMigrations.workspaceId, workspace.id),
            or(
              legacyMessageIds.length > 0
                ? inArray(
                    mailUnificationMigrations.candidateMessageId,
                    legacyMessageIds,
                  )
                : undefined,
              canonicalMessageIds.length > 0
                ? inArray(
                    mailUnificationMigrations.mailMessageId,
                    canonicalMessageIds,
                  )
                : undefined,
            ),
          ),
        );
    }
    if (canonicalThreadIds.length > 0 || canonicalMessageIds.length > 0) {
      await tx
        .delete(mailIdempotencyKeys)
        .where(
          and(
            eq(mailIdempotencyKeys.workspaceId, workspace.id),
            or(
              canonicalThreadIds.length > 0
                ? inArray(mailIdempotencyKeys.threadId, canonicalThreadIds)
                : undefined,
              canonicalMessageIds.length > 0
                ? inArray(
                    mailIdempotencyKeys.mailMessageId,
                    canonicalMessageIds,
                  )
                : undefined,
              eq(mailIdempotencyKeys.candidateId, candidateId),
              applicationIds.length > 0
                ? inArray(mailIdempotencyKeys.applicationId, applicationIds)
                : undefined,
            ),
          ),
        );
    }
    await tx
      .delete(mailMessages)
      .where(
        and(
          eq(mailMessages.workspaceId, workspace.id),
          or(
            eq(mailMessages.candidateId, candidateId),
            applicationIds.length > 0
              ? inArray(mailMessages.applicationId, applicationIds)
              : undefined,
          ),
        ),
      );
    await tx
      .delete(mailThreads)
      .where(
        and(
          eq(mailThreads.workspaceId, workspace.id),
          or(
            eq(mailThreads.candidateId, candidateId),
            applicationIds.length > 0
              ? inArray(mailThreads.applicationId, applicationIds)
              : undefined,
            canonicalThreadIds.length > 0
              ? inArray(mailThreads.id, canonicalThreadIds)
              : undefined,
          ),
        ),
      );
    await tx
      .delete(candidatePortalMagicLinks)
      .where(
        and(
          eq(candidatePortalMagicLinks.workspaceId, workspace.id),
          sql`lower(${candidatePortalMagicLinks.email}) = lower(${candidate.email})`,
        ),
      );
    if (uniqueDocumentIds.length > 0) {
      await tx
        .delete(documents)
        .where(
          and(
            eq(documents.workspaceId, workspace.id),
            inArray(documents.id, uniqueDocumentIds),
          ),
        );
    }
    await tx
      .delete(savedSignatures)
      .where(
        and(
          eq(savedSignatures.workspaceId, workspace.id),
          eq(savedSignatures.ownerType, "candidate"),
          eq(savedSignatures.ownerId, candidateId),
        ),
      );
    await tx
      .update(dsarRequests)
      .set({
        status: "completed",
        processedBy,
        notes: sql`concat_ws(E'\\n\\n', ${dsarRequests.notes}, 'Erasure fulfilled by permanent candidate deletion.')`,
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(dsarRequests.workspaceId, workspace.id),
          eq(dsarRequests.candidateId, candidateId),
          eq(dsarRequests.type, "erasure"),
          inArray(dsarRequests.status, ["pending", "processing", "blocked"]),
        ),
      );
    return tx
      .delete(candidates)
      .where(
        and(
          eq(candidates.id, candidateId),
          eq(candidates.workspaceId, workspace.id),
          isNotNull(candidates.deletedAt),
        ),
      )
      .returning({ id: candidates.id });
  });

  if (deleted) {
    const externalInterviewResources = linkedInterviews.reduce(
      (count, interview) =>
        count +
        Number(Boolean(interview.gcalEventId)) +
        Number(Boolean(interview.teamsMeetingId)) +
        Number(Boolean(interview.zoomMeetingId)) +
        Number(Boolean(interview.jitsiRoom)) +
        Number(Boolean(interview.calBookingUid)),
      0,
    );
    return {
      ok: true,
      stats: {
        applications: applicationIds.length,
        candidateFiles: candidateFileRows.length,
        legacyMessages: legacyMessageRows.length,
        mailAttachments: mailAttachmentRows.length,
        mailMessages: mailMessageRows.length,
        mailThreads: canonicalThreadIds.length,
        documents: uniqueDocumentIds.length,
        documentVersions: versionRows.length,
        signatureArtifacts: signatureArtifactRows.length,
        savedSignatures: candidateSignatureRows.length,
        interviews: linkedInterviews.length,
        externalInterviewResources,
        externalSignatureRequests: activeExternalSignatures.length,
        storageObjects: storageKeys.size,
        durationMs: Date.now() - purgeStartedAt,
      },
    } as const;
  }
  return { ok: false, error: "Candidate not found in trash." } as const;
}

/** Permanently delete an active candidate from the normal delete action. */
export async function deleteCandidate(
  candidateId: string,
  processedBy: string,
) {
  const { organization: workspace } = await getWorkspaceContext();
  const [movedToTrash] = await db
    .update(candidates)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(candidates.id, candidateId),
        eq(candidates.workspaceId, workspace.id),
        isNull(candidates.deletedAt),
      ),
    )
    .returning({ id: candidates.id });

  if (!movedToTrash) {
    return { ok: false, error: "Candidate not found." } as const;
  }

  return permanentlyDeleteCandidate(candidateId, processedBy);
}

// ── Duplicate detection helpers ──────────────────────────────────────────────

export type SuspectCandidate = {
  candidateId: string;
  fullName: string;
  email: string;
};

/** Fuzzy name match , heuristic only, no AI. Used for the profile banner. */
export async function findSuspectDuplicates(
  candidateId: string,
  firstName: string,
  lastName: string,
  workspaceId: string,
): Promise<SuspectCandidate[]> {
  const { ilike, ne, sql: drizzleSql } = await import("drizzle-orm");

  const rows = await db
    .select({
      candidateId: candidates.id,
      fullName: drizzleSql<string>`concat(${candidates.firstName}, ' ', ${candidates.lastName})`,
      email: candidates.email,
    })
    .from(candidates)
    .where(
      and(
        eq(candidates.workspaceId, workspaceId),
        ne(candidates.id, candidateId),
        isNull(candidates.deletedAt),
        or(
          ilike(candidates.firstName, `%${firstName}%`),
          ilike(candidates.lastName, `%${lastName}%`),
        ),
      ),
    )
    .limit(5);

  return rows.map((r) => ({
    candidateId: r.candidateId,
    fullName: r.fullName,
    email: r.email,
  }));
}
