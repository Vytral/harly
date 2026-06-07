import "server-only";

import { and, desc, eq, inArray, or } from "drizzle-orm";

import { db } from "@openhire/db";
import {
  activityEvents,
  applicationAnswers,
  applications,
  applicationQuestions,
  candidates,
  candidateFiles,
  candidateMessages,
  candidateNotes,
  candidateTags,
  jobs,
  jobStages,
  scorecards,
  user as authUsers,
} from "@openhire/db";
import { getWorkspaceContext } from "@/features/workspaces/context";

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
  applicationCount: number;
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

export async function listCandidates() {
  const { organization: workspace } = await getWorkspaceContext();

  const rows = await db
    .select({
      candidateId: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      email: candidates.email,
      phone: candidates.phone,
      location: candidates.location,
      candidateCreatedAt: candidates.createdAt,
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
    .where(eq(candidates.workspaceId, workspace.id))
    .orderBy(desc(candidates.createdAt), desc(applications.appliedAt));

  const candidateMap = new Map<string, CandidateListItem & { createdAt: Date }>();

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
        applicationCount: 0,
        latestApplication: null,
        createdAt: row.candidateCreatedAt,
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
      applicationCount: candidate.applicationCount,
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

  const candidateApplications = await db
    .select({
      id: applications.id,
      workspaceId: applications.workspaceId,
      jobId: applications.jobId,
      jobTitle: jobs.title,
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
      id: candidateMessages.id,
      direction: candidateMessages.direction,
      subject: candidateMessages.subject,
      body: candidateMessages.body,
      toEmail: candidateMessages.toEmail,
      status: candidateMessages.status,
      authorName: authUsers.name,
      createdAt: candidateMessages.createdAt,
    })
    .from(candidateMessages)
    .leftJoin(authUsers, eq(authUsers.id, candidateMessages.authorId))
    .where(
      and(
        eq(candidateMessages.workspaceId, workspace.id),
        eq(candidateMessages.candidateId, candidate.id),
      ),
    )
    .orderBy(desc(candidateMessages.createdAt));

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
      return {
        id: event.id,
        type: event.type,
        label: `Applied to ${applicationJobTitles.get(event.entityId) ?? "a job"}`,
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

    if (event.type === "application.rejected") {
      return {
        id: event.id,
        type: event.type,
        label: "Marked as rejected",
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

  return {
    workspaceId: workspace.id,
    candidate,
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
    tags: tagRows,
    messages: messageRows.map((row) => ({
      id: row.id,
      direction: row.direction,
      subject: row.subject,
      body: row.body,
      toEmail: row.toEmail,
      status: row.status,
      authorName: row.authorName,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}
