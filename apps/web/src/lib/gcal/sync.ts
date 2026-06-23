import "server-only";

import { eq } from "drizzle-orm";

import { db, interviews } from "@harly/db";

import { getWorkspaceGCalConfig } from "@/lib/gcal/config";
import { createEvent, updateEvent, deleteEvent } from "@/lib/gcal/client";

/**
 * Fire-and-forget: create a Google Calendar event for a new interview and
 * store the event ID back on the interview row.
 */
export async function syncInterviewToGCal(opts: {
  workspaceId: string;
  interviewId: string;
  summary: string;
  description?: string;
  start: Date;
  durationMins: number;
  attendees?: string[];
  location?: string;
}): Promise<void> {
  try {
    const config = await getWorkspaceGCalConfig(opts.workspaceId);
    if (!config) return;

    const event = await createEvent(
      config.oauth2Client,
      config.calendarId,
      {
        summary: opts.summary,
        description: opts.description,
        start: opts.start,
        durationMins: opts.durationMins,
        attendees: opts.attendees,
        location: opts.location,
      },
    );

    await db
      .update(interviews)
      .set({ gcalEventId: event.id })
      .where(eq(interviews.id, opts.interviewId));
  } catch (err) {
    console.error("[gcal-sync] Failed to create event:", err);
  }
}

/**
 * Fire-and-forget: cancel or delete the GCal event when interview is canceled.
 */
export async function cancelInterviewGCalEvent(opts: {
  workspaceId: string;
  interviewId: string;
  gcalEventId: string;
}): Promise<void> {
  try {
    const config = await getWorkspaceGCalConfig(opts.workspaceId);
    if (!config) return;

    await deleteEvent(config.oauth2Client, config.calendarId, opts.gcalEventId);

    await db
      .update(interviews)
      .set({ gcalEventId: null })
      .where(eq(interviews.id, opts.interviewId));
  } catch (err) {
    console.error("[gcal-sync] Failed to cancel event:", err);
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
}): Promise<void> {
  try {
    const config = await getWorkspaceGCalConfig(opts.workspaceId);
    if (!config) return;

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
      },
    );
  } catch (err) {
    console.error("[gcal-sync] Failed to update event:", err);
  }
}
