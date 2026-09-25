"use server";

import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import {
  candidates,
  db,
  interviewSyncs,
  interviews,
  jobs,
  organization,
  user as authUsers,
} from "@harly/db";

import { getWorkspaceContext } from "@/features/workspaces/context";
import { requirePermission } from "@/features/workspaces/permissions-server";
import {
  gcalEventIdForInterview,
  syncInterviewToGCal,
  updateInterviewGCalEvent,
} from "@/lib/gcal/sync";
import {
  replaceInterviewToTeams,
  syncInterviewToTeams,
} from "@/lib/outlook/teams-sync";
import { replaceInterviewToZoom, syncInterviewToZoom } from "@/lib/zoom/sync";
import { syncInterviewToJitsi } from "@/lib/jitsi/sync";
import { claimInterviewSync, trackInterviewSync } from "@/lib/interviews/sync-ledger";
import { createLogger } from "@/lib/logger";

const log = createLogger("interview-sync-actions");

const TYPE_LABEL: Record<string, string> = {
  screening: "Screening interview",
  culture_fit: "Culture fit interview",
  technical: "Technical interview",
  onsite: "On-site interview",
  final: "Final interview",
};

const PROVIDER_LABEL: Record<string, string> = {
  google_calendar: "Google Calendar",
  zoom: "Zoom",
  microsoft_teams: "Microsoft Teams",
  jitsi: "Jitsi",
};

/** Retry one failed/pending provider operation from the interview detail. */
export async function retryInterviewSyncAction(input: {
  syncId: string;
}): Promise<{ success: boolean; error?: string; warning?: string }> {
  try {
    const { organization } = await getWorkspaceContext();
    await requirePermission("collab:write");
    return retryInterviewSyncForWorkspace({
      workspaceId: organization.id,
      syncId: input.syncId,
    });
  } catch (error) {
    log.error(error, "retryInterviewSyncAction failed");
    return { success: false, error: "Could not retry this synchronization." };
  }
}

/** Same retry seam for trusted cron workers; callers must provide workspace scope. */
export async function retryInterviewSyncForWorkspace(input: {
  workspaceId: string;
  syncId: string;
  /** Existing claim owner when invoked by the cron worker. */
  workerId?: string;
  database?: typeof db;
}): Promise<{ success: boolean; error?: string; warning?: string }> {
  try {
    const database = input.database ?? db;
    const workspace = { id: input.workspaceId };

    const [row] = await database
      .select({
        sync: interviewSyncs,
        interview: interviews,
        candidateEmail: candidates.email,
        interviewerEmail: authUsers.email,
        companyName: organization.name,
        jobTitle: jobs.title,
      })
      .from(interviewSyncs)
      .innerJoin(
        interviews,
        and(
          eq(interviews.id, interviewSyncs.interviewId),
          eq(interviews.workspaceId, workspace.id),
        ),
      )
      .innerJoin(
        candidates,
        and(
          eq(candidates.id, interviews.candidateId),
          eq(candidates.workspaceId, workspace.id),
          isNull(candidates.deletedAt),
        ),
      )
      .innerJoin(
        jobs,
        and(
          eq(jobs.id, interviews.jobId),
          eq(jobs.workspaceId, workspace.id),
          isNull(jobs.deletedAt),
        ),
      )
      .innerJoin(organization, eq(organization.id, workspace.id))
      .leftJoin(authUsers, eq(authUsers.id, interviews.interviewerId))
      .where(
        and(
          eq(interviewSyncs.id, input.syncId),
          eq(interviewSyncs.workspaceId, workspace.id),
        ),
      )
      .limit(1);

    if (!row) return { success: false, error: "Sync attempt not found." };

    const workerId = input.workerId ?? `interview-sync-manual:${randomUUID()}`;
    const claimed = await claimInterviewSync({
      workspaceId: workspace.id,
      syncId: input.syncId,
      workerId,
      database,
    });
    if (!claimed) {
      return {
        success: false,
        error: "This synchronization is already being retried or is no longer retryable.",
      };
    }

    const { sync, interview } = row;
    const attendees = [row.candidateEmail, row.interviewerEmail].filter(
      (email): email is string => Boolean(email),
    );
    const summary = interview.title ?? TYPE_LABEL[interview.type] ?? "Interview";
    const providerLabel = PROVIDER_LABEL[sync.provider] ?? sync.provider;

    if (sync.operation === "cancel") {
      const result = await trackInterviewSync({
        workspaceId: workspace.id,
        interviewId: interview.id,
        provider: sync.provider,
        operation: "cancel",
        workerId,
        run: async () => {
          switch (sync.provider) {
            case "google_calendar":
              if (!interview.gcalEventId && !sync.providerResourceId) {
                return false;
              }
              return (await import("@/lib/gcal/sync")).cancelInterviewGCalEvent({
                workspaceId: workspace.id,
                interviewId: interview.id,
                gcalEventId:
                  interview.gcalEventId ??
                  sync.providerResourceId ??
                  gcalEventIdForInterview(interview.id),
              });
            case "zoom":
              if (!interview.zoomMeetingId && !sync.providerResourceId) return false;
              return (await import("@/lib/zoom/sync")).cancelInterviewZoomMeeting({
                workspaceId: workspace.id,
                interviewId: interview.id,
                zoomMeetingId: interview.zoomMeetingId ?? sync.providerResourceId!,
              });
            case "microsoft_teams":
              if (!interview.teamsMeetingId && !sync.providerResourceId) return false;
              return (await import("@/lib/outlook/teams-sync")).cancelInterviewTeamsMeeting({
                workspaceId: workspace.id,
                interviewId: interview.id,
                teamsMeetingId:
                  interview.teamsMeetingId ?? sync.providerResourceId!,
              });
            case "jitsi":
              if (!interview.jitsiRoom) return false;
              return (await import("@/lib/jitsi/sync")).cancelInterviewJitsiMeeting({
                workspaceId: workspace.id,
                interviewId: interview.id,
              });
          }
        },
        isSuccess: Boolean,
      });

      return result
        ? { success: true }
        : {
            success: false,
            error: `${providerLabel} could not complete the cancellation.`,
          };
    }

    type ProviderRetryResult = {
      ok: boolean;
      resourceId?: string;
      resourceUrl?: string;
    };

    const result = await trackInterviewSync<ProviderRetryResult>({
      workspaceId: workspace.id,
      interviewId: interview.id,
      provider: sync.provider,
      operation: "upsert",
      workerId,
      run: async (): Promise<ProviderRetryResult> => {
        switch (sync.provider) {
          case "google_calendar": {
            if (interview.gcalEventId) {
              const ok = await updateInterviewGCalEvent({
                workspaceId: workspace.id,
                gcalEventId: interview.gcalEventId,
                summary,
                start: interview.scheduledAt,
                durationMins: interview.durationMins,
                attendees: attendees.length > 0 ? attendees : undefined,
                location: interview.location ?? undefined,
              });
              return { ok, resourceId: interview.gcalEventId };
            }
            const providerResult = await syncInterviewToGCal({
              workspaceId: workspace.id,
              interviewId: interview.id,
              summary,
              description: interview.notes ?? undefined,
              start: interview.scheduledAt,
              durationMins: interview.durationMins,
              attendees: attendees.length > 0 ? attendees : undefined,
              location: interview.location ?? undefined,
              mode: interview.mode === "video" ? "video" : undefined,
            });
            return providerResult.ok
              ? { ok: true, resourceId: providerResult.eventId, resourceUrl: providerResult.meetLink }
              : { ok: false };
          }
          case "zoom": {
            if (interview.zoomMeetingId) {
              const providerResult = await replaceInterviewToZoom({
                workspaceId: workspace.id,
                interviewId: interview.id,
                previousMeetingId: interview.zoomMeetingId,
                previousMeetLink: interview.meetLink,
                summary,
                start: interview.scheduledAt,
                durationMins: interview.durationMins,
              });
              return providerResult.ok
                ? { ok: true, resourceId: providerResult.meetingId, resourceUrl: providerResult.joinUrl }
                : { ok: false };
            }
            const providerResult = await syncInterviewToZoom({
              workspaceId: workspace.id,
              interviewId: interview.id,
              summary,
              start: interview.scheduledAt,
              durationMins: interview.durationMins,
            });
            return providerResult
              ? {
                  ok: true,
                  resourceId: providerResult.meetingId,
                  resourceUrl: providerResult.joinUrl,
                }
              : { ok: false };
          }
          case "microsoft_teams": {
            if (interview.teamsMeetingId) {
              const providerResult = await replaceInterviewToTeams({
                workspaceId: workspace.id,
                interviewId: interview.id,
                previousMeetingId: interview.teamsMeetingId,
                previousMeetLink: interview.meetLink,
                summary,
                start: interview.scheduledAt,
                durationMins: interview.durationMins,
              });
              return providerResult.ok
                ? { ok: true, resourceId: providerResult.meetingId, resourceUrl: providerResult.joinUrl }
                : { ok: false };
            }
            const providerResult = await syncInterviewToTeams({
              workspaceId: workspace.id,
              interviewId: interview.id,
              summary,
              start: interview.scheduledAt,
              durationMins: interview.durationMins,
            });
            return providerResult
              ? {
                  ok: true,
                  resourceId: providerResult.meetingId,
                  resourceUrl: providerResult.joinUrl,
                }
              : { ok: false };
          }
          case "jitsi": {
            const providerResult = await syncInterviewToJitsi({
              workspaceId: workspace.id,
              interviewId: interview.id,
            });
            return providerResult
              ? {
                  ok: true,
                  resourceId: providerResult.room,
                  resourceUrl: providerResult.joinUrl,
                }
              : { ok: false };
          }
        }
        return { ok: false };
      },
      isSuccess: (providerResult) => providerResult.ok,
      resourceId: (providerResult) => providerResult.resourceId,
      resourceUrl: (providerResult) => providerResult.resourceUrl,
    });

    if (!result.ok) {
      return {
        success: false,
        error: `${providerLabel} could not complete the synchronization.`,
      };
    }
    return { success: true };
  } catch (error) {
    log.error(error, "retryInterviewSyncForWorkspace failed");
    return { success: false, error: "Could not retry this synchronization." };
  }
}

/**
 * Reconcile provider work left by a committed interview mutation. This is
 * deliberately scoped to one interview and only selects pending/failed rows;
 * a workflow retry therefore does not replay already-synced providers or send
 * a second calendar invitation.
 */
export async function retryInterviewSyncsForInterview(input: {
  workspaceId: string;
  interviewId: string;
  database?: typeof db;
}): Promise<{ attempted: number; failed: number }> {
  const database = input.database ?? db;
  const rows = await database
    .select({ id: interviewSyncs.id })
    .from(interviewSyncs)
    .where(
      and(
        eq(interviewSyncs.workspaceId, input.workspaceId),
        eq(interviewSyncs.interviewId, input.interviewId),
        // A workflow retry is an explicit operator/engine retry. It may run
        // before the ledger's exponential backoff because the node itself is
        // already the durable retry boundary.
        eq(interviewSyncs.status, "failed"),
      ),
    );

  let failed = 0;
  for (const row of rows) {
    const result = await retryInterviewSyncForWorkspace({
      workspaceId: input.workspaceId,
      syncId: row.id,
      database,
    });
    if (!result.success) failed += 1;
  }
  return { attempted: rows.length, failed };
}
