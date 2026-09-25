import { and, eq, exists, isNull } from "drizzle-orm";

import { candidates, db, interviews } from "@harly/db";

import { createMeeting, deleteMeeting, findMeetingByTrackingField } from "./client";

function formatZoomDateTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "");
}

const HARLY_TRACKING_FIELD = "harly_interview_effect";

function zoomSyncMarker(interviewId: string, operation: string): string {
  return `${operation}:${interviewId}`;
}

async function persistZoomMeeting(
  workspaceId: string,
  interviewId: string,
  result: { id: number; join_url: string },
): Promise<void> {
  await db
    .update(interviews)
    .set({
      meetLink: result.join_url,
      zoomMeetingId: String(result.id),
    })
    .where(
      and(
        eq(interviews.id, interviewId),
        eq(interviews.workspaceId, workspaceId),
        activeCandidateForInterview(workspaceId),
      ),
    );
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

    const marker = zoomSyncMarker(
      params.interviewId,
      `create:${params.start.getTime()}:${params.durationMins}`,
    );
    let result: { id: number; join_url: string };
    try {
      result = await createMeeting(params.workspaceId, {
        topic: params.summary,
        tracking_fields: [
          { field: HARLY_TRACKING_FIELD, value: marker, visible: false },
        ],
        type: 2,
        start_time: formatZoomDateTime(params.start),
        duration: params.durationMins,
      });
    } catch (error) {
      // The provider may have committed before the response was lost. Recover
      // only an exact Harly marker; never guess from title or start time.
      const recovered = await findMeetingByTrackingField(
        params.workspaceId,
        HARLY_TRACKING_FIELD,
        marker,
      ).catch((lookupError) => {
        console.error("[zoom] Failed to reconcile ambiguous meeting create", lookupError);
        return null;
      });
      if (!recovered) throw error;
      result = recovered;
    }

    await persistZoomMeeting(params.workspaceId, params.interviewId, result);

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
      tracking_fields: [
        {
          field: HARLY_TRACKING_FIELD,
          value: zoomSyncMarker(
            params.interviewId,
            `replace:${params.start.getTime()}:${params.durationMins}`,
          ),
          visible: false,
        },
      ],
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
