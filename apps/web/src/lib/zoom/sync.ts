import { eq } from "drizzle-orm";

import { db, interviews } from "@harly/db";

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
      .where(eq(interviews.id, params.interviewId));

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

export async function cancelInterviewZoomMeeting(params: CancelInterviewZoomParams) {
  try {
    await deleteMeeting(params.workspaceId, params.zoomMeetingId);

    await db
      .update(interviews)
      .set({ zoomMeetingId: null })
      .where(eq(interviews.id, params.interviewId));
  } catch (error) {
    console.error("[zoom] Failed to cancel meeting", error);
  }
}
