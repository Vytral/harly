import "server-only";

import { eq } from "drizzle-orm";

import { db, interviews } from "@harly/db";

import { getWorkspaceOutlookConfig } from "@/lib/outlook/config";
import { createTeamsMeeting, deleteTeamsMeeting } from "@/lib/outlook/client";
import { createLogger } from "@/lib/logger";

const log = createLogger("outlook-teams-sync");

/**
 * Fire-and-forget: create a Teams online meeting for a video interview
 * and store the meeting ID + join URL back on the interview row.
 */
export async function syncInterviewToTeams(opts: {
  workspaceId: string;
  interviewId: string;
  summary: string;
  start: Date;
  durationMins: number;
}): Promise<void> {
  try {
    const config = await getWorkspaceOutlookConfig(opts.workspaceId);
    if (!config) return;

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
      .where(eq(interviews.id, opts.interviewId));
  } catch (err) {
    log.error(err, "[teams-sync] Failed to create meeting");
  }
}

/**
 * Fire-and-forget: delete the Teams meeting when interview is canceled.
 */
export async function cancelInterviewTeamsMeeting(opts: {
  workspaceId: string;
  interviewId: string;
  teamsMeetingId: string;
}): Promise<void> {
  try {
    const config = await getWorkspaceOutlookConfig(opts.workspaceId);
    if (!config) return;

    await deleteTeamsMeeting(config.accessToken, opts.teamsMeetingId);

    await db
      .update(interviews)
      .set({ teamsMeetingId: null })
      .where(eq(interviews.id, opts.interviewId));
  } catch (err) {
    log.error(err, "[teams-sync] Failed to cancel meeting");
  }
}
