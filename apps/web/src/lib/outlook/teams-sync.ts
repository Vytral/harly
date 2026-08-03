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

export type TeamsMeetingReplacementResult =
  | { ok: true; joinUrl: string; meetingId: string }
  | { ok: false; reason: "create_failed" | "persist_failed" | "old_meeting_not_deleted" };

/** Replace a Teams meeting with create-before-delete ordering and compensation. */
export async function replaceInterviewToTeams(opts: {
  workspaceId: string;
  interviewId: string;
  previousMeetingId: string;
  previousMeetLink: string | null;
  summary: string;
  start: Date;
  durationMins: number;
}): Promise<TeamsMeetingReplacementResult> {
  const config = await getWorkspaceOutlookConfig(opts.workspaceId);
  if (!config) return { ok: false, reason: "create_failed" };

  let replacement: { id: string; joinUrl: string };
  try {
    replacement = await createTeamsMeeting(config.accessToken, {
      subject: opts.summary,
      start: opts.start,
      durationMins: opts.durationMins,
    });
  } catch (error) {
    log.error(error, "[teams-sync] Failed to create replacement meeting");
    return { ok: false, reason: "create_failed" };
  }

  let persisted = false;
  try {
    const rows = await db
      .update(interviews)
      .set({ teamsMeetingId: replacement.id, meetLink: replacement.joinUrl })
      .where(
        and(
          eq(interviews.id, opts.interviewId),
          eq(interviews.workspaceId, opts.workspaceId),
          eq(interviews.teamsMeetingId, opts.previousMeetingId),
        ),
      )
      .returning({ id: interviews.id });
    persisted = rows.length > 0;
  } catch (error) {
    log.error(error, "[teams-sync] Failed to persist replacement meeting");
  }

  if (!persisted) {
    await deleteTeamsMeeting(config.accessToken, replacement.id).catch((error) =>
      log.error(error, "[teams-sync] Failed to clean up unpersisted replacement"),
    );
    return { ok: false, reason: "persist_failed" };
  }

  try {
    await deleteTeamsMeeting(config.accessToken, opts.previousMeetingId);
    return {
      ok: true,
      joinUrl: replacement.joinUrl,
      meetingId: replacement.id,
    };
  } catch (error) {
    log.error(error, "[teams-sync] Failed to delete previous meeting");
    try {
      const restored = await db
        .update(interviews)
        .set({
          teamsMeetingId: opts.previousMeetingId,
          meetLink: opts.previousMeetLink,
        })
        .where(
          and(
            eq(interviews.id, opts.interviewId),
            eq(interviews.workspaceId, opts.workspaceId),
            eq(interviews.teamsMeetingId, replacement.id),
          ),
        )
        .returning({ id: interviews.id });
      if (restored.length > 0) {
        await deleteTeamsMeeting(config.accessToken, replacement.id).catch((cleanupError) =>
          log.error(cleanupError, "[teams-sync] Failed to clean up replacement meeting"),
        );
      }
    } catch (restoreError) {
      // Keep the valid replacement referenced if restoration itself fails.
      log.error(restoreError, "[teams-sync] Failed to restore previous meeting");
    }
    return { ok: false, reason: "old_meeting_not_deleted" };
  }
}
