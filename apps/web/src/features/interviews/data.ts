import "server-only";

import { and, asc, desc, eq, gte } from "drizzle-orm";

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
      interviewerName: authUsers.name,
      jobTitle: jobs.title,
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
    interviewerName: row.interviewerName,
    jobTitle: row.jobTitle,
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
      interviewerName: authUsers.name,
      jobTitle: jobs.title,
      candidateId: candidates.id,
      first: candidates.firstName,
      last: candidates.lastName,
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
    interviewerName: row.interviewerName,
    jobTitle: row.jobTitle,
    candidateId: row.candidateId,
    candidateName: `${row.first} ${row.last}`,
  }));
}
