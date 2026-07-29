import { and, eq, exists, isNull } from "drizzle-orm";

import { candidates, db, interviews } from "@harly/db";

import { createMeeting, deleteMeeting } from "./client";

function formatZoomDateTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "");
}

type SyncInterviewToZoomParams = {
  workspaceId: string;
  interviewId: string;
  summary: string;
  start: Date;
  durationMins: number;
};

export async function syncInterviewToZoom(params: SyncInterviewToZoomParams) {
  try {
    if (!(await hasActiveInterview(params.workspaceId, params.interviewId))) {
      return null;
    }

    const result = await createMeeting(params.workspaceId, {
      topic: params.summary,
      type: 2,
      start_time: formatZoomDateTime(params.start),
      duration: params.durationMins,
    });

    await db
      .update(interviews)
      .set({
        meetLink: result.join_url,
        zoomMeetingId: String(result.id),
      })
      .where(
        and(
          eq(interviews.id, params.interviewId),
          eq(interviews.workspaceId, params.workspaceId),
          activeCandidateForInterview(params.workspaceId),
        ),
      );

    return { joinUrl: result.join_url, meetingId: String(result.id) };
  } catch (error) {
    console.error("[zoom] Failed to create meeting", error);
    return null;
  }
}

type CancelInterviewZoomParams = {
  workspaceId: string;
  interviewId: string;
  zoomMeetingId: string;
};

function activeCandidateForInterview(workspaceId: string) {
  return exists(
    db
      .select({ id: candidates.id })
      .from(candidates)
      .where(
        and(
          eq(candidates.id, interviews.candidateId),
          eq(candidates.workspaceId, workspaceId),
          isNull(candidates.deletedAt),
        ),
      ),
  );
}

async function hasActiveInterview(workspaceId: string, interviewId: string) {
  const [interview] = await db
    .select({ id: interviews.id })
    .from(interviews)
    .where(
      and(
        eq(interviews.id, interviewId),
        eq(interviews.workspaceId, workspaceId),
        activeCandidateForInterview(workspaceId),
      ),
    )
    .limit(1);
  return Boolean(interview);
}

export async function cancelInterviewZoomMeeting(params: CancelInterviewZoomParams) {
  try {
    if (!(await hasActiveInterview(params.workspaceId, params.interviewId))) {
      return false;
    }

    await deleteMeeting(params.workspaceId, params.zoomMeetingId);

    await db
      .update(interviews)
      .set({ zoomMeetingId: null })
      .where(
        and(
          eq(interviews.id, params.interviewId),
          eq(interviews.workspaceId, params.workspaceId),
          activeCandidateForInterview(params.workspaceId),
        ),
      );
    return true;
  } catch (error) {
    console.error("[zoom] Failed to cancel meeting", error);
    return false;
  }
}
