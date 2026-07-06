import "server-only";

import { and, asc, between, desc, eq, gte } from "drizzle-orm";

import { db } from "@harly/db";
import {
  candidates,
  interviews,
  jobs,
  user as authUsers,
} from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";
import type {
  CandidateInterviewItem,
  UpcomingInterviewItem,
} from "@/features/interviews/shared";

/** All interviews for a candidate, newest scheduled first. */
export async function listCandidateInterviews(
  candidateId: string,
): Promise<CandidateInterviewItem[]> {
  const { organization: workspace } = await getWorkspaceContext();

  const rows = await db
    .select({
      id: interviews.id,
      type: interviews.type,
      mode: interviews.mode,
      status: interviews.status,
      scheduledAt: interviews.scheduledAt,
      durationMins: interviews.durationMins,
      title: interviews.title,
      location: interviews.location,
      notes: interviews.notes,
      interviewerId: interviews.interviewerId,
      interviewerName: authUsers.name,
      interviewerImage: authUsers.image,
      jobTitle: jobs.title,
      gcalEventId: interviews.gcalEventId,
      meetLink: interviews.meetLink,
      teamsMeetingId: interviews.teamsMeetingId,
      zoomMeetingId: interviews.zoomMeetingId,
      briefContent: interviews.briefContent,
    })
    .from(interviews)
    .innerJoin(
      jobs,
      and(eq(jobs.workspaceId, workspace.id), eq(jobs.id, interviews.jobId)),
    )
    .leftJoin(authUsers, eq(authUsers.id, interviews.interviewerId))
    .where(
      and(
        eq(interviews.workspaceId, workspace.id),
        eq(interviews.candidateId, candidateId),
      ),
    )
    .orderBy(desc(interviews.scheduledAt));

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    mode: row.mode,
    status: row.status,
    scheduledAt: row.scheduledAt.toISOString(),
    durationMins: row.durationMins,
    title: row.title,
    location: row.location,
    notes: row.notes,
    interviewerId: row.interviewerId,
    interviewerName: row.interviewerName,
    interviewerImage: row.interviewerImage,
    jobTitle: row.jobTitle,
    gcalEventId: row.gcalEventId,
    meetLink: row.meetLink,
    teamsMeetingId: row.teamsMeetingId,
    zoomMeetingId: row.zoomMeetingId,
    briefContent: (row.briefContent ?? null) as import("@/lib/ai/schemas").InterviewBrief | null,
  }));
}

/** Upcoming scheduled interviews across the workspace, soonest first. */
export async function listUpcomingInterviews(): Promise<UpcomingInterviewItem[]> {
  const { organization: workspace } = await getWorkspaceContext();
  const now = new Date();

  const rows = await db
    .select({
      id: interviews.id,
      type: interviews.type,
      mode: interviews.mode,
      status: interviews.status,
      scheduledAt: interviews.scheduledAt,
      durationMins: interviews.durationMins,
      title: interviews.title,
      location: interviews.location,
      notes: interviews.notes,
      interviewerId: interviews.interviewerId,
      interviewerName: authUsers.name,
      interviewerImage: authUsers.image,
      jobId: jobs.id,
      jobTitle: jobs.title,
      candidateId: candidates.id,
      first: candidates.firstName,
      last: candidates.lastName,
      gcalEventId: interviews.gcalEventId,
      meetLink: interviews.meetLink,
      teamsMeetingId: interviews.teamsMeetingId,
      zoomMeetingId: interviews.zoomMeetingId,
    })
    .from(interviews)
    .innerJoin(
      candidates,
      and(
        eq(candidates.workspaceId, workspace.id),
        eq(candidates.id, interviews.candidateId),
      ),
    )
    .innerJoin(
      jobs,
      and(eq(jobs.workspaceId, workspace.id), eq(jobs.id, interviews.jobId)),
    )
    .leftJoin(authUsers, eq(authUsers.id, interviews.interviewerId))
    .where(
      and(
        eq(interviews.workspaceId, workspace.id),
        eq(interviews.status, "scheduled"),
        gte(interviews.scheduledAt, now),
      ),
    )
    .orderBy(asc(interviews.scheduledAt));

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    mode: row.mode,
    status: row.status,
    scheduledAt: row.scheduledAt.toISOString(),
    durationMins: row.durationMins,
    title: row.title,
    location: row.location,
    notes: row.notes,
    interviewerId: row.interviewerId,
    interviewerName: row.interviewerName,
    interviewerImage: row.interviewerImage,
    jobId: row.jobId,
    jobTitle: row.jobTitle,
    candidateId: row.candidateId,
    candidateName: `${row.first} ${row.last}`,
    gcalEventId: row.gcalEventId,
    meetLink: row.meetLink,
    teamsMeetingId: row.teamsMeetingId,
    zoomMeetingId: row.zoomMeetingId,
  }));
}

/** All interviews scheduled within [start, end], any status — powers the calendar grid. */
export async function listInterviewsForRange(
  start: Date,
  end: Date,
): Promise<UpcomingInterviewItem[]> {
  const { organization: workspace } = await getWorkspaceContext();

  const rows = await db
    .select({
      id: interviews.id,
      type: interviews.type,
      mode: interviews.mode,
      status: interviews.status,
      scheduledAt: interviews.scheduledAt,
      durationMins: interviews.durationMins,
      title: interviews.title,
      location: interviews.location,
      notes: interviews.notes,
      interviewerId: interviews.interviewerId,
      interviewerName: authUsers.name,
      interviewerImage: authUsers.image,
      jobId: jobs.id,
      jobTitle: jobs.title,
      candidateId: candidates.id,
      first: candidates.firstName,
      last: candidates.lastName,
      gcalEventId: interviews.gcalEventId,
      meetLink: interviews.meetLink,
      teamsMeetingId: interviews.teamsMeetingId,
      zoomMeetingId: interviews.zoomMeetingId,
    })
    .from(interviews)
    .innerJoin(
      candidates,
      and(
        eq(candidates.workspaceId, workspace.id),
        eq(candidates.id, interviews.candidateId),
      ),
    )
    .innerJoin(
      jobs,
      and(eq(jobs.workspaceId, workspace.id), eq(jobs.id, interviews.jobId)),
    )
    .leftJoin(authUsers, eq(authUsers.id, interviews.interviewerId))
    .where(
      and(
        eq(interviews.workspaceId, workspace.id),
        between(interviews.scheduledAt, start, end),
      ),
    )
    .orderBy(asc(interviews.scheduledAt));

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    mode: row.mode,
    status: row.status,
    scheduledAt: row.scheduledAt.toISOString(),
    durationMins: row.durationMins,
    title: row.title,
    location: row.location,
    notes: row.notes,
    interviewerId: row.interviewerId,
    interviewerName: row.interviewerName,
    interviewerImage: row.interviewerImage,
    jobId: row.jobId,
    jobTitle: row.jobTitle,
    candidateId: row.candidateId,
    candidateName: `${row.first} ${row.last}`,
    gcalEventId: row.gcalEventId,
    meetLink: row.meetLink,
    teamsMeetingId: row.teamsMeetingId,
    zoomMeetingId: row.zoomMeetingId,
  }));
}
