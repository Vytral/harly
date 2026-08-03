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

export type InterviewMeetingReplacementResult =
  | { ok: true; joinUrl: string; meetingId: string }
  | { ok: false; reason: "inactive" | "create_failed" | "persist_failed" | "old_meeting_not_deleted" };

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

/**
 * Replace a Zoom meeting without creating a window where Harly points at a
 * dead meeting. The new meeting is persisted first, then the old remote
 * meeting is deleted. If deletion fails, the old row is restored while the
 * replacement is cleaned up.
 */
export async function replaceInterviewToZoom(params: {
  workspaceId: string;
  interviewId: string;
  previousMeetingId: string;
  previousMeetLink: string | null;
  summary: string;
  start: Date;
  durationMins: number;
}): Promise<InterviewMeetingReplacementResult> {
  if (!(await hasActiveInterview(params.workspaceId, params.interviewId))) {
    return { ok: false, reason: "inactive" };
  }

  let replacement: Awaited<ReturnType<typeof createMeeting>>;
  try {
    replacement = await createMeeting(params.workspaceId, {
      topic: params.summary,
      type: 2,
      start_time: formatZoomDateTime(params.start),
      duration: params.durationMins,
    });
  } catch (error) {
    console.error("[zoom] Failed to create replacement meeting", error);
    return { ok: false, reason: "create_failed" };
  }

  const replacementId = String(replacement.id);
  let persisted = false;
  try {
    const rows = await db
      .update(interviews)
      .set({
        meetLink: replacement.join_url,
        zoomMeetingId: replacementId,
      })
      .where(
        and(
          eq(interviews.id, params.interviewId),
          eq(interviews.workspaceId, params.workspaceId),
          eq(interviews.zoomMeetingId, params.previousMeetingId),
          activeCandidateForInterview(params.workspaceId),
        ),
      )
      .returning({ id: interviews.id });
    persisted = rows.length > 0;
  } catch (error) {
    console.error("[zoom] Failed to persist replacement meeting", error);
  }

  if (!persisted) {
    await deleteMeeting(params.workspaceId, replacementId).catch((error) =>
      console.error("[zoom] Failed to clean up unpersisted replacement", error),
    );
    return { ok: false, reason: "persist_failed" };
  }

  try {
    await deleteMeeting(params.workspaceId, params.previousMeetingId);
    return {
      ok: true,
      joinUrl: replacement.join_url,
      meetingId: replacementId,
    };
  } catch (error) {
    console.error("[zoom] Failed to delete previous meeting", error);
    try {
      const restored = await db
        .update(interviews)
        .set({
          meetLink: params.previousMeetLink,
          zoomMeetingId: params.previousMeetingId,
        })
        .where(
          and(
            eq(interviews.id, params.interviewId),
            eq(interviews.workspaceId, params.workspaceId),
            eq(interviews.zoomMeetingId, replacementId),
          ),
        )
        .returning({ id: interviews.id });
      if (restored.length > 0) {
        await deleteMeeting(params.workspaceId, replacementId).catch((cleanupError) =>
          console.error("[zoom] Failed to clean up replacement meeting", cleanupError),
        );
      }
    } catch (restoreError) {
      // Keep the valid replacement referenced if restoration itself fails.
      console.error("[zoom] Failed to restore previous meeting", restoreError);
    }
    return { ok: false, reason: "old_meeting_not_deleted" };
  }
}
