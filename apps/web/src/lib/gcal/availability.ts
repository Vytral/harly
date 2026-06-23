"use server";

import { and, eq, gt, lt, ne } from "drizzle-orm";

import { db, interviews } from "@harly/db";
import { getWorkspaceGCalConfig } from "@/lib/gcal/config";
import { getFreeBusy } from "@/lib/gcal/client";
import { getWorkspaceContext } from "@/features/workspaces/context";

type AvailabilityResult = {
  gcalBusy: Array<{ start: string; end: string }>;
  internalConflicts: Array<{
    interviewId: string;
    title: string | null;
    scheduledAt: string;
    durationMins: number;
  }>;
  error?: string;
};

/**
 * Check availability from two sources:
 * 1. Google Calendar free/busy (external events)
 * 2. Internal interview overlaps (same interviewer, same time)
 *
 * Optionally filter by interviewerId to check a specific person's conflicts.
 */
export async function checkAvailability(opts: {
  timeMin: Date;
  timeMax: Date;
  interviewerId?: string;
  excludeInterviewId?: string;
}): Promise<AvailabilityResult> {
  try {
    const { organization: workspace } = await getWorkspaceContext();

    // 1. GCal free/busy
    let gcalBusy: Array<{ start: string; end: string }> = [];
    const config = await getWorkspaceGCalConfig(workspace.id);
    if (config) {
      try {
        gcalBusy = await getFreeBusy(
          config.oauth2Client,
          config.calendarId,
          opts.timeMin,
          opts.timeMax,
        );
      } catch {
        // GCal check failing shouldn't block scheduling.
      }
    }

    // 2. Internal interview conflicts (same interviewer overlap)
    let internalConflicts: AvailabilityResult["internalConflicts"] = [];
    if (opts.interviewerId) {
      const conditions = [
        eq(interviews.workspaceId, workspace.id),
        eq(interviews.interviewerId, opts.interviewerId),
        eq(interviews.status, "scheduled"),
        lt(interviews.scheduledAt, opts.timeMax),
        gt(
          // scheduledAt + durationMins > timeMin
          // We approximate by comparing scheduledAt + 480min max as upper bound
          // and use the DB-level check below.
          interviews.scheduledAt,
          new Date(opts.timeMin.getTime() - 480 * 60_000),
        ),
      ];

      if (opts.excludeInterviewId) {
        conditions.push(ne(interviews.id, opts.excludeInterviewId));
      }

      const overlapping = await db
        .select({
          id: interviews.id,
          title: interviews.title,
          scheduledAt: interviews.scheduledAt,
          durationMins: interviews.durationMins,
        })
        .from(interviews)
        .where(and(...conditions));

      // Precise overlap check in JS (DB can't do scheduledAt + durationMins easily).
      internalConflicts = overlapping.filter((iv) => {
        const ivStart = new Date(iv.scheduledAt).getTime();
        const ivEnd = ivStart + iv.durationMins * 60_000;
        const reqStart = opts.timeMin.getTime();
        const reqEnd = opts.timeMax.getTime();
        return ivStart < reqEnd && ivEnd > reqStart;
      }).map((iv) => ({
        interviewId: iv.id,
        title: iv.title,
        scheduledAt: iv.scheduledAt.toISOString(),
        durationMins: iv.durationMins,
      }));
    }

    return { gcalBusy, internalConflicts };
  } catch {
    return { gcalBusy: [], internalConflicts: [], error: "Could not check availability." };
  }
}
