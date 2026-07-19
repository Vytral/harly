import "server-only";

import { and, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";

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
  dsarRequests,
  interviews,
  jobs,
  jobStages,
  mailAttachments,
  mailMessages,
  mailThreads,
  poolEntries,
  scorecards,
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
import type { InterviewType, InterviewMode } from "@/features/interviews/shared";
import { cancelInterviewGCalEvent } from "@/lib/gcal/sync";
import { storage } from "@/lib/storage";
import { isWorkspaceStorageKey } from "@/lib/storage-validation";
import { resumeKeyFromUrl } from "@/lib/resume/storage-key";

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
  status: "pending" | "processing" | "completed" | "denied";
  requestedBy: string | null;
  processedBy: string | null;
  notes: string | null;
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

function workspaceStorageKeyFromUrl(workspaceId: string, fileUrl: string) {
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
      location: sql<string | null>`coalesce(${candidates.address}, ${candidates.location})`,
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
      and(eq(candidates.workspaceId, workspace.id), isNull(candidates.deletedAt)),
    )
    .orderBy(desc(candidates.createdAt), desc(applications.appliedAt));

  const candidateMap = new Map<string, CandidateListItem & { createdAt: Date; updatedAt: Date }>();

  for (const row of rows) {
    const existing = candidateMap.get(row.candidateId);
    const candidate =
      existing ??
      {
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
    .select({ candidateId: candidateTags.candidateId, label: candidateTags.label })
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

  return Array.from(candidateMap.values())
    .sort((first, second) => second.createdAt.getTime() - first.createdAt.getTime())
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
      and(eq(candidates.workspaceId, workspace.id), eq(candidates.id, candidateId)),
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
              inArray(applicationAnswers.applicationId, applicationIdsForAnswers),
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

  const messageRows = await db
    .select({
      id: mailMessages.id,
      direction: mailMessages.direction,
      subject: mailMessages.subject,
      body: mailMessages.textBody,
      toEmails: mailMessages.toEmails,
      fromEmail: mailMessages.fromEmail,
      source: mailThreads.source,
      createdAt: mailMessages.receivedAt,
    })
    .from(mailMessages)
    .innerJoin(mailThreads, eq(mailThreads.id, mailMessages.threadId))
    .where(
      and(
        eq(mailMessages.workspaceId, workspace.id),
        eq(mailMessages.candidateId, candidate.id),
      ),
    )
    .orderBy(desc(mailMessages.receivedAt));

  const messageAttachments = messageRows.length
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
            inArray(mailAttachments.messageId, messageRows.map((message) => message.id)),
          ),
        )
    : [];
  const attachmentsByMessage = new Map<string, typeof messageAttachments>();
  for (const attachment of messageAttachments) {
    const list = attachmentsByMessage.get(attachment.messageId) ?? [];
    list.push(attachment);
    attachmentsByMessage.set(attachment.messageId, list);
  }

  const applicationIds = candidateApplications.map(
    (application) => application.id,
  );

  const events =
    applicationIds.length > 0
      ? await db
          .select({
            id: activityEvents.id,
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
                eq(activityEvents.entityId, candidate.id),
                inArray(activityEvents.entityId, applicationIds),
              ),
            ),
          )
          .orderBy(desc(activityEvents.createdAt))
      : await db
          .select({
            id: activityEvents.id,
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
              eq(activityEvents.entityId, candidate.id),
            ),
          )
          .orderBy(desc(activityEvents.createdAt));

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
  const stageNames = new Map(
    stageRows.map((stage) => [stage.id, stage.name]),
  );

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
        label: `Moved to ${toStageId ? stageNames.get(toStageId) ?? "another stage" : "another stage"}`,
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

    if (event.type === "evaluation.ai_generated") {
      const score = event.metadata && typeof event.metadata === "object"
        ? (event.metadata as Record<string, unknown>).score
        : null;
      return {
        id: event.id,
        type: event.type,
        label: `AI evaluation generated${typeof score === "number" ? ` · ${score}/100` : ""}`,
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
      const interviewType = meta && typeof meta.type === "string" ? (meta.type as InterviewType) : null;
      const interviewMode = meta && typeof meta.mode === "string" ? (meta.mode as InterviewMode) : null;
      const typeLabel = interviewType ? interviewTypeLabel(interviewType) : null;
      const modeLabel = interviewMode ? interviewModeLabel(interviewMode) : null;
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
      provider: row.provider,
      modelId: row.modelId,
      score: row.score,
      recommendation: row.recommendation,
      summary: row.summary,
      strengths: Array.isArray(row.strengths) ? (row.strengths as string[]) : [],
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
      direction: row.direction,
      transport: row.source,
      subject: row.subject,
      body: row.body,
      toEmail: Array.isArray(row.toEmails) ? String(row.toEmails[0] ?? "") : "",
      fromEmail: row.fromEmail,
      status: "sent" as const,
      authorName: null,
      attachments: attachmentsByMessage.get(row.id) ?? [],
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
      and(eq(candidates.workspaceId, workspace.id), isNotNull(candidates.deletedAt)),
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
    .where(and(eq(candidates.id, candidateId), eq(candidates.workspaceId, workspace.id)))
    .returning({ id: candidates.id });

  return candidate
    ? ({ ok: true } as const)
    : ({ ok: false, error: "Candidate not found." } as const);
}

/** Permanently delete a trashed candidate and all related records (cascade). */
export async function permanentlyDeleteCandidate(
  candidateId: string,
  processedBy: string,
) {
  const { organization: workspace } = await getWorkspaceContext();

  const [candidate] = await db
    .select({ avatarUrl: candidates.avatarUrl })
    .from(candidates)
    .where(
      and(
        eq(candidates.id, candidateId),
        eq(candidates.workspaceId, workspace.id),
        isNotNull(candidates.deletedAt),
      ),
    )
    .limit(1);
  if (!candidate) return { ok: false, error: "Candidate not found in trash." } as const;

  // Candidate rows cascade-delete, but object storage does not. Remove every
  // workspace-owned resume and avatar first; fail closed if any object cannot
  // be erased so the request can be retried instead of claiming completion.
  const fileRows = await db
    .select({ fileUrl: candidateFiles.fileUrl })
    .from(candidateFiles)
    .where(
      and(
        eq(candidateFiles.workspaceId, workspace.id),
        eq(candidateFiles.candidateId, candidateId),
      ),
    );
  const storageKeys = new Set(
    [...fileRows.map((file) => file.fileUrl), candidate.avatarUrl]
      .filter((url): url is string => Boolean(url))
      .map((url) => workspaceStorageKeyFromUrl(workspace.id, url))
      .filter((key): key is string => Boolean(key)),
  );
  const storageResults = await Promise.allSettled(
    [...storageKeys].map((key) => storage.delete(key)),
  );
  if (storageResults.some((result) => result.status === "rejected")) {
    return { ok: false, error: "Could not erase every stored candidate file. Please retry." } as const;
  }

  // Cancel any Google Calendar events for this candidate's interviews before
  // the cascade delete removes the rows (and we lose the gcalEventId refs).
  const linkedInterviews = await db
    .select({ id: interviews.id, gcalEventId: interviews.gcalEventId })
    .from(interviews)
    .where(
      and(
        eq(interviews.candidateId, candidateId),
        eq(interviews.workspaceId, workspace.id),
        isNotNull(interviews.gcalEventId),
      ),
    );

  for (const iv of linkedInterviews) {
    if (iv.gcalEventId) {
      void cancelInterviewGCalEvent({
        workspaceId: workspace.id,
        interviewId: iv.id,
        gcalEventId: iv.gcalEventId,
      });
    }
  }

  // Erase the candidate's AI chat history (IA-02 / GDPR Art. 17). Conversations
  // linked via candidateId also cascade-delete their messages; this explicit
  // delete covers the same rows and is safe to run regardless.
  await deleteConversationsForCandidate(candidateId);

  // The destructive action in Trash is the staff approval to fulfil an open
  // erasure request. Complete it before the FK is set to null by deletion.
  const now = new Date();
  const [openErasure] = await db
    .select({ notes: dsarRequests.notes })
    .from(dsarRequests)
    .where(
      and(
        eq(dsarRequests.workspaceId, workspace.id),
        eq(dsarRequests.candidateId, candidateId),
        eq(dsarRequests.type, "erasure"),
        inArray(dsarRequests.status, ["pending", "processing"]),
      ),
    )
    .orderBy(desc(dsarRequests.createdAt))
    .limit(1);

  await db
    .update(dsarRequests)
    .set({
      status: "completed",
      processedBy,
      notes: [openErasure?.notes, "Erasure fulfilled by permanent candidate deletion."]
        .filter(Boolean)
        .join("\n\n"),
      completedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(dsarRequests.workspaceId, workspace.id),
        eq(dsarRequests.candidateId, candidateId),
        eq(dsarRequests.type, "erasure"),
        inArray(dsarRequests.status, ["pending", "processing"]),
      ),
    );

  const [deleted] = await db
    .delete(candidates)
    .where(
      and(
        eq(candidates.id, candidateId),
        eq(candidates.workspaceId, workspace.id),
        isNotNull(candidates.deletedAt),
      ),
    )
    .returning({ id: candidates.id });

  return deleted
    ? ({ ok: true } as const)
    : ({ ok: false, error: "Candidate not found in trash." } as const);
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
