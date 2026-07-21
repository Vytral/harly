import "server-only";

import { and, eq } from "drizzle-orm";

import { db, interviewSyncs, interviews } from "@harly/db";

export type InterviewOutcomeStatus =
  | "complete"
  | "needs_attention"
  | "missing_meeting_link"
  | "unverified";

export type InterviewOutcome = {
  persisted: boolean;
  interviewId: string;
  candidateId: string;
  applicationId: string;
  jobId: string;
  status: "scheduled" | "completed" | "canceled";
  scheduledAt: string;
  durationMins: number;
  location: string | null;
  meetingLink: string | null;
  syncs: Array<{
    provider: string;
    operation: string;
    status: string;
    attempts: number;
    lastError: string | null;
  }>;
  outcomeStatus: InterviewOutcomeStatus;
  warnings: string[];
};

export function summarizeInterviewOutcome(input: {
  mode: "video" | "phone" | "onsite";
  location: string | null;
  meetLink: string | null;
  syncs: Array<{ status: string; lastError: string | null }>;
}): Pick<InterviewOutcome, "outcomeStatus" | "warnings"> {
  const warnings = input.syncs
    .filter((sync) => sync.status === "failed" || sync.status === "pending")
    .map((sync) => sync.lastError)
    .filter((error): error is string => Boolean(error));

  if (warnings.length > 0) {
    return { outcomeStatus: "needs_attention", warnings };
  }
  if (input.mode === "video" && !input.meetLink && !input.location) {
    return {
      outcomeStatus: "missing_meeting_link",
      warnings: ["The interview was saved without a meeting link."],
    };
  }
  return { outcomeStatus: "complete", warnings: [] };
}

/** Read back the persisted interview and provider ledger after a write. */
export async function verifyInterviewOutcome(input: {
  workspaceId: string;
  interviewId: string;
  candidateId: string;
}): Promise<InterviewOutcome | null> {
  const [row] = await db
    .select({
      id: interviews.id,
      candidateId: interviews.candidateId,
      applicationId: interviews.applicationId,
      jobId: interviews.jobId,
      status: interviews.status,
      scheduledAt: interviews.scheduledAt,
      durationMins: interviews.durationMins,
      mode: interviews.mode,
      location: interviews.location,
      meetLink: interviews.meetLink,
    })
    .from(interviews)
    .where(
      and(
        eq(interviews.id, input.interviewId),
        eq(interviews.workspaceId, input.workspaceId),
        eq(interviews.candidateId, input.candidateId),
      ),
    )
    .limit(1);

  if (!row) return null;

  const syncRows = await db
    .select({
      provider: interviewSyncs.provider,
      operation: interviewSyncs.operation,
      status: interviewSyncs.status,
      attempts: interviewSyncs.attempts,
      lastError: interviewSyncs.lastError,
    })
    .from(interviewSyncs)
    .where(
      and(
        eq(interviewSyncs.workspaceId, input.workspaceId),
        eq(interviewSyncs.interviewId, row.id),
      ),
    );

  const summary = summarizeInterviewOutcome({
    mode: row.mode,
    location: row.location,
    meetLink: row.meetLink,
    syncs: syncRows,
  });

  return {
    persisted: true,
    interviewId: row.id,
    candidateId: row.candidateId,
    applicationId: row.applicationId,
    jobId: row.jobId,
    status: row.status,
    scheduledAt: row.scheduledAt.toISOString(),
    durationMins: row.durationMins,
    location: row.location,
    meetingLink: row.meetLink,
    syncs: syncRows,
    ...summary,
  };
}
