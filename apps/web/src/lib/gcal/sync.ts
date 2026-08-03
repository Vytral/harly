import "server-only";

import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db, interviews } from "@harly/db";

import {
  getWorkspaceGCalConfig,
  invalidateWorkspaceGCalConnection,
} from "@/lib/gcal/config";
import {
  createEvent,
  deleteEvent,
  getEvent,
  updateEvent,
} from "@/lib/gcal/client";
import { createLogger } from "@/lib/logger";

const log = createLogger("gcal-sync");

/**
 * Google Calendar event IDs are the idempotency key for interview creation.
 * Google only accepts base32hex characters (a-v and 0-9) for client IDs;
 * UUIDs and a human-readable `harly-` prefix are therefore not safe here.
 */
export function gcalEventIdForInterview(interviewId: string): string {
  return `harl${createHash("sha256").update(interviewId).digest("hex")}`;
}

/**
 * Create a Google Calendar event for a new interview and store the event ID
 * back on the interview row. The database interview is the source of truth:
 * calendar failure is returned as a typed warning instead of rejecting the
 * already-created interview.
 */
export type GCalSyncResult =
  | { ok: true; eventId: string; meetLink?: string }
  | { ok: false; reason: "not_connected" | "invalid_grant" | "failed" };

export async function syncInterviewToGCal(opts: {
  workspaceId: string;
  interviewId: string;
  summary: string;
  description?: string;
  start: Date;
  durationMins: number;
  attendees?: string[];
  location?: string;
  mode?: string;
  timeZone?: string;
}): Promise<GCalSyncResult> {
  try {
    const config = await getWorkspaceGCalConfig(opts.workspaceId);
    if (!config) return { ok: false, reason: "not_connected" };

    const eventId = gcalEventIdForInterview(opts.interviewId);
    let event;
    try {
      event = await createEvent(config.oauth2Client, config.calendarId, {
        id: eventId,
        summary: opts.summary,
        description: opts.description,
        start: opts.start,
        durationMins: opts.durationMins,
        attendees: opts.attendees,
        location: opts.location,
        conferenceData: opts.mode === "video",
        timeZone: opts.timeZone ?? "UTC",
      });
    } catch (error) {
      // A timeout can happen after Google committed the event but before Harly
      // persisted gcalEventId. Re-read the deterministic event instead of
      // creating a second invitation.
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("Google Calendar API 409")) throw error;
      event = await getEvent(config.oauth2Client, config.calendarId, eventId);
    }

    const update: Record<string, unknown> = { gcalEventId: event.id };
    if (event.hangoutLink) {
      update.meetLink = event.hangoutLink;
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
    return {
      ok: true,
      eventId: event.id,
      meetLink: event.hangoutLink,
    };
  } catch (err) {
    log.error(err, "[gcal-sync] Failed to create event");
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("invalid_grant")) {
      await invalidateWorkspaceGCalConnection(opts.workspaceId);
      return { ok: false, reason: "invalid_grant" };
    }
    return { ok: false, reason: "failed" };
  }
}

/**
 * Fire-and-forget: cancel or delete the GCal event when interview is canceled.
 */
export async function cancelInterviewGCalEvent(opts: {
  workspaceId: string;
  interviewId: string;
  gcalEventId: string;
}): Promise<boolean> {
  try {
    const config = await getWorkspaceGCalConfig(opts.workspaceId);
    if (!config) return false;

    await deleteEvent(config.oauth2Client, config.calendarId, opts.gcalEventId);

    await db
      .update(interviews)
      .set({ gcalEventId: null })
      .where(
        and(
          eq(interviews.id, opts.interviewId),
          eq(interviews.workspaceId, opts.workspaceId),
        ),
      );
    return true;
  } catch (err) {
    log.error(err, "[gcal-sync] Failed to cancel event");
    return false;
  }
}

/**
 * Fire-and-forget: update the GCal event when interview is rescheduled.
 */
export async function updateInterviewGCalEvent(opts: {
  workspaceId: string;
  gcalEventId: string;
  summary?: string;
  start?: Date;
  durationMins?: number;
  attendees?: string[];
  location?: string;
  status?: "confirmed" | "cancelled";
  timeZone?: string;
}): Promise<boolean> {
  try {
    const config = await getWorkspaceGCalConfig(opts.workspaceId);
    if (!config) return false;

    await updateEvent(
      config.oauth2Client,
      config.calendarId,
      opts.gcalEventId,
      {
        summary: opts.summary,
        start: opts.start,
        durationMins: opts.durationMins,
        attendees: opts.attendees,
        location: opts.location,
        status: opts.status,
        timeZone: opts.timeZone ?? "UTC",
      },
    );
    return true;
  } catch (err) {
    log.error(err, "[gcal-sync] Failed to update event");
    return false;
  }
}
