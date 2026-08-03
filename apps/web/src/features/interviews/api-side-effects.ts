import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import {
  candidates,
  db,
  interviews,
  jobs,
  organization,
  user as authUsers,
} from "@harly/db";

import {
  cancelInterviewGCalEvent,
  syncInterviewToGCal,
  updateInterviewGCalEvent,
} from "@/lib/gcal/sync";
import { getWorkspaceGCalConfig } from "@/lib/gcal/config";
import {
  cancelInterviewTeamsMeeting,
  replaceInterviewToTeams,
  syncInterviewToTeams,
} from "@/lib/outlook/teams-sync";
import { getWorkspaceOutlookConfig } from "@/lib/outlook/config";
import {
  cancelInterviewZoomMeeting,
  replaceInterviewToZoom,
  syncInterviewToZoom,
} from "@/lib/zoom/sync";
import { getZoomToken } from "@/lib/zoom/config";
import {
  cancelInterviewJitsiMeeting,
  syncInterviewToJitsi,
} from "@/lib/jitsi/sync";
import { getWorkspaceJitsiConfig } from "@/lib/jitsi/config";
import { trackInterviewSync } from "@/lib/interviews/sync-ledger";
import {
  enqueueEmailOutbox,
  processEmailOutbox,
} from "@/lib/email/outbox-processor";
import { getInboundReplyTo } from "@/lib/email/inbound-token";
import { createLogger } from "@/lib/logger";

import type { Interview } from "@harly/db";

const log = createLogger("interview-api-side-effects");

type ApiInterviewAction = "scheduled" | "rescheduled" | "canceled";

const TYPE_LABEL: Record<string, string> = {
  screening: "Screening interview",
  culture_fit: "Culture fit interview",
  technical: "Technical interview",
  onsite: "On-site interview",
  final: "Final interview",
};

const MODE_LABEL: Record<string, string> = {
  video: "Video call",
  phone: "Phone call",
  onsite: "On-site",
};

type InterviewContext = {
  email: string | null;
  firstName: string;
  lastName: string;
  companyName: string;
  jobTitle: string;
  interviewerEmail: string | null;
  applicationId: string;
};

async function getInterviewContext(
  workspaceId: string,
  interviewId: string,
): Promise<InterviewContext | null> {
  const [row] = await db
    .select({
      email: candidates.email,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      companyName: organization.name,
      jobTitle: jobs.title,
      interviewerId: interviews.interviewerId,
      applicationId: interviews.applicationId,
    })
    .from(interviews)
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, interviews.candidateId),
        eq(candidates.workspaceId, workspaceId),
        isNull(candidates.deletedAt),
      ),
    )
    .innerJoin(
      jobs,
      and(
        eq(jobs.id, interviews.jobId),
        eq(jobs.workspaceId, workspaceId),
        isNull(jobs.deletedAt),
      ),
    )
    .innerJoin(organization, eq(organization.id, workspaceId))
    .where(
      and(
        eq(interviews.id, interviewId),
        eq(interviews.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!row) return null;

  let interviewerEmail: string | null = null;
  if (row.interviewerId) {
    const [interviewer] = await db
      .select({ email: authUsers.email })
      .from(authUsers)
      .where(eq(authUsers.id, row.interviewerId))
      .limit(1);
    interviewerEmail = interviewer?.email ?? null;
  }

  return { ...row, interviewerEmail };
}

async function sendInterviewEmail(
  workspaceId: string,
  actorUserId: string,
  action: ApiInterviewAction,
  interview: Interview,
  context: InterviewContext,
) {
  if (!context.email) return;
  const replyTo = await getInboundReplyTo(workspaceId, context.applicationId);
  const outboxId = await enqueueEmailOutbox(
    workspaceId,
    `interview.${action}`,
    {
      candidateEmail: context.email,
      candidateName: `${context.firstName} ${context.lastName}`.trim(),
      companyName: context.companyName,
      jobTitle: context.jobTitle,
      interviewType: TYPE_LABEL[interview.type] ?? "Interview",
      scheduledAt: interview.scheduledAt.toISOString(),
      mode: MODE_LABEL[interview.mode] ?? interview.mode,
      location: interview.meetLink ?? interview.location ?? undefined,
      durationMins: interview.durationMins,
      replyTo,
      interviewerName: context.interviewerEmail ?? undefined,
    },
    undefined,
    actorUserId,
  );
  await processEmailOutbox({ ids: [outboxId], workspaceId });
}

async function syncCalendarForApi(
  workspaceId: string,
  interview: Interview,
  context: InterviewContext,
  action: ApiInterviewAction,
) {
  const attendees = [context.email, context.interviewerEmail].filter(
    (email): email is string => Boolean(email),
  );

  if (action === "canceled") {
    if (!interview.gcalEventId) return;
    await trackInterviewSync({
      workspaceId,
      interviewId: interview.id,
      provider: "google_calendar",
      operation: "cancel",
      run: () =>
        cancelInterviewGCalEvent({
          workspaceId,
          interviewId: interview.id,
          gcalEventId: interview.gcalEventId!,
        }),
      isSuccess: Boolean,
    });
    return;
  }

  if (interview.gcalEventId && action === "rescheduled") {
    await trackInterviewSync({
      workspaceId,
      interviewId: interview.id,
      provider: "google_calendar",
      operation: "upsert",
      run: async () =>
        updateInterviewGCalEvent({
          workspaceId,
          gcalEventId: interview.gcalEventId!,
          start: interview.scheduledAt,
          durationMins: interview.durationMins,
          attendees: attendees.length > 0 ? attendees : undefined,
          location: interview.location ?? undefined,
          timeZone: "UTC",
        }),
      isSuccess: Boolean,
    });
    return;
  }

  await trackInterviewSync({
    workspaceId,
    interviewId: interview.id,
    provider: "google_calendar",
    operation: "upsert",
    run: () =>
      syncInterviewToGCal({
        workspaceId,
        interviewId: interview.id,
        summary: interview.title ?? TYPE_LABEL[interview.type] ?? "Interview",
        start: interview.scheduledAt,
        durationMins: interview.durationMins,
        attendees: attendees.length > 0 ? attendees : undefined,
        location: interview.location ?? undefined,
        mode: interview.mode === "video" ? "video" : undefined,
        timeZone: "UTC",
      }),
    isSuccess: (result) => result.ok,
    resourceId: (result) => (result.ok ? result.eventId : undefined),
    resourceUrl: (result) => (result.ok ? result.meetLink : undefined),
  });
}

async function syncVideoForApi(input: {
  workspaceId: string;
  interview: Interview;
  context: InterviewContext;
  previous?: Interview;
  action: ApiInterviewAction;
}): Promise<"calendar" | "video" | "none"> {
  const { workspaceId, interview, context, previous, action } = input;
  if (action === "canceled") {
    const providers = [
      previous?.teamsMeetingId
        ? {
            provider: "microsoft_teams" as const,
            id: previous.teamsMeetingId,
            run: () =>
              cancelInterviewTeamsMeeting({
                workspaceId,
                interviewId: interview.id,
                teamsMeetingId: previous.teamsMeetingId!,
              }),
          }
        : null,
      previous?.zoomMeetingId
        ? {
            provider: "zoom" as const,
            id: previous.zoomMeetingId,
            run: () =>
              cancelInterviewZoomMeeting({
                workspaceId,
                interviewId: interview.id,
                zoomMeetingId: previous.zoomMeetingId!,
              }),
          }
        : null,
      previous?.jitsiRoom
        ? {
            provider: "jitsi" as const,
            id: previous.jitsiRoom,
            run: () =>
              cancelInterviewJitsiMeeting({ workspaceId, interviewId: interview.id }),
          }
        : null,
    ].filter(
      (provider): provider is NonNullable<typeof provider> => provider !== null,
    );
    for (const provider of providers) {
      await trackInterviewSync({
        workspaceId,
        interviewId: interview.id,
        provider: provider.provider,
        operation: "cancel",
        run: provider.run,
        isSuccess: Boolean,
      });
    }
    return "none";
  }

  if (interview.mode !== "video") {
    if (previous?.teamsMeetingId) {
      await trackInterviewSync({
        workspaceId,
        interviewId: interview.id,
        provider: "microsoft_teams",
        operation: "cancel",
        run: () =>
          cancelInterviewTeamsMeeting({
            workspaceId,
            interviewId: interview.id,
            teamsMeetingId: previous.teamsMeetingId!,
          }),
        isSuccess: Boolean,
      });
    }
    if (previous?.zoomMeetingId) {
      await trackInterviewSync({
        workspaceId,
        interviewId: interview.id,
        provider: "zoom",
        operation: "cancel",
        run: () =>
          cancelInterviewZoomMeeting({
            workspaceId,
            interviewId: interview.id,
            zoomMeetingId: previous.zoomMeetingId!,
          }),
        isSuccess: Boolean,
      });
    }
    if (previous?.jitsiRoom) {
      await trackInterviewSync({
        workspaceId,
        interviewId: interview.id,
        provider: "jitsi",
        operation: "cancel",
        run: () => cancelInterviewJitsiMeeting({ workspaceId, interviewId: interview.id }),
        isSuccess: Boolean,
      });
    }
    return "none";
  }

  // REST has no separate meetingProvider field. A supplied URL therefore has
  // the same meaning as dashboard's explicit external provider: preserve it
  // and only mirror the interview to Calendar, instead of silently replacing
  // the candidate's link with whichever provider happens to be connected.
  if (
    interview.meetLink &&
    !previous?.teamsMeetingId &&
    !previous?.zoomMeetingId &&
    !previous?.jitsiRoom
  ) {
    await syncCalendarForApi(workspaceId, interview, context, action);
    return "calendar";
  }

  const [zoomToken, outlookConfig, gcalConfig, jitsiConfig] = await Promise.all([
    getZoomToken(workspaceId),
    getWorkspaceOutlookConfig(workspaceId),
    getWorkspaceGCalConfig(workspaceId),
    getWorkspaceJitsiConfig(workspaceId),
  ]);
  const summary = interview.title ?? TYPE_LABEL[interview.type] ?? "Interview";

  if (previous?.teamsMeetingId) {
    await trackInterviewSync({
      workspaceId,
      interviewId: interview.id,
      provider: "microsoft_teams",
      operation: "upsert",
      run: () =>
        replaceInterviewToTeams({
          workspaceId,
          interviewId: interview.id,
          previousMeetingId: previous.teamsMeetingId!,
          previousMeetLink: previous.meetLink,
          summary,
          start: interview.scheduledAt,
          durationMins: interview.durationMins,
        }),
      isSuccess: (result) => result.ok,
      resourceId: (result) => (result.ok ? result.meetingId : undefined),
      resourceUrl: (result) => (result.ok ? result.joinUrl : undefined),
    });
    return "video";
  }
  if (previous?.zoomMeetingId) {
    await trackInterviewSync({
      workspaceId,
      interviewId: interview.id,
      provider: "zoom",
      operation: "upsert",
      run: () =>
        replaceInterviewToZoom({
          workspaceId,
          interviewId: interview.id,
          previousMeetingId: previous.zoomMeetingId!,
          previousMeetLink: previous.meetLink,
          summary,
          start: interview.scheduledAt,
          durationMins: interview.durationMins,
        }),
      isSuccess: (result) => result.ok,
      resourceId: (result) => (result.ok ? result.meetingId : undefined),
      resourceUrl: (result) => (result.ok ? result.joinUrl : undefined),
    });
    return "video";
  }
  if (previous?.jitsiRoom) return "video";

  if (zoomToken) {
    await trackInterviewSync({
      workspaceId,
      interviewId: interview.id,
      provider: "zoom",
      operation: "upsert",
      run: () =>
        syncInterviewToZoom({
          workspaceId,
          interviewId: interview.id,
          summary,
          start: interview.scheduledAt,
          durationMins: interview.durationMins,
        }),
      isSuccess: Boolean,
      resourceId: (result) => result?.meetingId,
      resourceUrl: (result) => result?.joinUrl,
    });
    return "video";
  } else if (outlookConfig) {
    await trackInterviewSync({
      workspaceId,
      interviewId: interview.id,
      provider: "microsoft_teams",
      operation: "upsert",
      run: () =>
        syncInterviewToTeams({
          workspaceId,
          interviewId: interview.id,
          summary,
          start: interview.scheduledAt,
          durationMins: interview.durationMins,
        }),
      isSuccess: Boolean,
      resourceId: (result) => result?.meetingId,
      resourceUrl: (result) => result?.joinUrl,
    });
    return "video";
  } else if (gcalConfig) {
    await syncCalendarForApi(workspaceId, interview, context, action);
    return "calendar";
  } else if (jitsiConfig) {
    await trackInterviewSync({
      workspaceId,
      interviewId: interview.id,
      provider: "jitsi",
      operation: "upsert",
      run: () => syncInterviewToJitsi({ workspaceId, interviewId: interview.id }),
      isSuccess: Boolean,
      resourceId: (result) => result?.room,
      resourceUrl: (result) => result?.joinUrl,
    });
    return "video";
  }
  return "none";
}

/** Apply the side effects that dashboard scheduling exposes to REST callers. */
export async function runApiInterviewSideEffects(input: {
  workspaceId: string;
  actorUserId: string;
  interview: Interview;
  previous?: Interview;
  action: ApiInterviewAction;
}): Promise<void> {
  let context: InterviewContext | null;
  try {
    context = await getInterviewContext(input.workspaceId, input.interview.id);
  } catch (error) {
    log.error(error, "REST interview context lookup failed after commit");
    return;
  }
  if (!context) return;

  let videoSync: "calendar" | "video" | "none" = "none";
  try {
    videoSync = await syncVideoForApi({ ...input, context });
  } catch (error) {
    log.error(error, "REST interview video side effect failed after commit");
  }

  if (
    videoSync !== "calendar" &&
    (input.interview.mode !== "video" ||
      videoSync === "none" ||
      (input.action === "rescheduled" &&
        Boolean(input.interview.gcalEventId)))
  ) {
    try {
      await syncCalendarForApi(
        input.workspaceId,
        input.interview,
        context,
        input.action,
      );
    } catch (error) {
      log.error(error, "REST interview calendar side effect failed after commit");
    }
  }

  try {
    await sendInterviewEmail(
      input.workspaceId,
      input.actorUserId,
      input.action,
      input.interview,
      context,
    );
  } catch (error) {
    log.error(error, "REST interview email side effect failed after commit");
  }
}

export function interviewPortalNotification(input: {
  action: ApiInterviewAction;
  interview: Interview;
}) {
  const labels: Record<ApiInterviewAction, { title: string; type: string }> = {
    scheduled: { title: "Interview scheduled", type: "interview_scheduled" },
    rescheduled: { title: "Interview rescheduled", type: "interview_rescheduled" },
    canceled: { title: "Interview canceled", type: "interview_canceled" },
  };
  const label = labels[input.action];
  return {
    candidateId: input.interview.candidateId,
    type: label.type,
    title: label.title,
    body:
      input.action === "canceled"
        ? "Your interview has been canceled."
        : `${label.title} for ${input.interview.scheduledAt.toISOString()}.`,
    href: `/portal/applications/${input.interview.applicationId}`,
    metadata: { interviewId: input.interview.id, applicationId: input.interview.applicationId },
  };
}
