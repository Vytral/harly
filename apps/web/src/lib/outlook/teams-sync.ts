import "server-only";

import { and, eq } from "drizzle-orm";

import { db, interviews } from "@harly/db";

import { getWorkspaceOutlookConfig } from "@/lib/outlook/config";
import { createTeamsMeeting, deleteTeamsMeeting } from "@/lib/outlook/client";
import { createLogger } from "@/lib/logger";

const log = createLogger("outlook-teams-sync");

/**
 * Create a Teams online meeting for a video interview and store the meeting
 * ID + join URL back on the interview row. Returning null is intentional: the
 * interview is still valid, but the caller must surface the provider failure.
 */
export async function syncInterviewToTeams(opts: {
  workspaceId: string;
  interviewId: string;
  summary: string;
  start: Date;
  durationMins: number;
}): Promise<{ joinUrl?: string; meetingId: string } | null> {
  try {
    const config = await getWorkspaceOutlookConfig(opts.workspaceId);
    if (!config) return null;

    const meeting = await createTeamsMeeting(config.accessToken, {
      subject: opts.summary,
      start: opts.start,
      durationMins: opts.durationMins,
    });

    const update: Record<string, unknown> = {
      teamsMeetingId: meeting.id,
    };
    if (meeting.joinUrl) {
      update.meetLink = meeting.joinUrl;
    }

    await db
      .update(interviews)
      .set(update)
      .where(
        and(
          eq(interviews.id, opts.interviewId),
          eq(interviews.workspaceId, opts.workspaceId),
        ),
      );

    return { joinUrl: meeting.joinUrl, meetingId: meeting.id };
  } catch (err) {
    log.error(err, "[teams-sync] Failed to create meeting");
    return null;
  }
}

/**
 * Delete the Teams meeting when interview is canceled.
 */
export async function cancelInterviewTeamsMeeting(opts: {
  workspaceId: string;
  interviewId: string;
  teamsMeetingId: string;
}): Promise<boolean> {
  try {
    const config = await getWorkspaceOutlookConfig(opts.workspaceId);
    if (!config) return false;

    await deleteTeamsMeeting(config.accessToken, opts.teamsMeetingId);

    await db
      .update(interviews)
      .set({ teamsMeetingId: null })
      .where(
        and(
          eq(interviews.id, opts.interviewId),
          eq(interviews.workspaceId, opts.workspaceId),
        ),
      );
    return true;
  } catch (err) {
    log.error(err, "[teams-sync] Failed to cancel meeting");
    return false;
  }
}
