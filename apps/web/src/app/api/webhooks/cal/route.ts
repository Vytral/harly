import { NextResponse, type NextRequest } from "next/server";

import { and, desc, eq, exists, isNull } from "drizzle-orm";

import {
  activityEvents,
  applications,
  candidatePortalNotifications,
  candidates,
  db,
  interviews,
  jobs,
  organization,
  workspaceSettings,
} from "@harly/db";
import { verifyCalSignature } from "@/lib/cal/client";
import {
  syncInterviewToGCal,
  cancelInterviewGCalEvent,
  updateInterviewGCalEvent,
} from "@/lib/gcal/sync";
import { getInboundReplyTo } from "@/lib/email/inbound-token";
import {
  enqueueEmailOutbox,
  processEmailOutbox,
} from "@/lib/email/outbox-processor";
import { trackInterviewSync } from "@/lib/interviews/sync-ledger";
import { createLogger } from "@/lib/logger";
import { persistDomainEvent, publishPersistedDomainEvents } from "@/server/events/emit";
import { emitWebhookEvent } from "@/server/webhooks/emit";

const log = createLogger("api-cal-webhook");

export const runtime = "nodejs";

type CalAttendee = { email?: string; name?: string; timeZone?: string };
type CalWebhookBody = {
  triggerEvent?: string;
  payload?: {
    uid?: string;
    bookingId?: number;
    startTime?: string;
    endTime?: string;
    title?: string;
    attendees?: CalAttendee[];
    metadata?: Record<string, unknown>;
    location?: string;
  };
};

type CalAction = "scheduled" | "rescheduled" | "canceled";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Best-effort map of a Cal.com location string to our interview mode. */
function inferMode(location: string | null): "video" | "phone" | "onsite" {
  if (!location) return "video";
  const lower = location.toLowerCase();
  if (lower.includes("phone") || lower.includes("tel")) return "phone";
  if (
    lower.includes("person") ||
    lower.includes("office") ||
    lower.includes("address")
  ) {
    return "onsite";
  }
  return "video";
}

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

function actionForEvent(event: string): CalAction | null {
  if (event === "BOOKING_CREATED") return "scheduled";
  if (event === "BOOKING_RESCHEDULED") return "rescheduled";
  if (event === "BOOKING_CANCELLED") return "canceled";
  return null;
}

function serializeCalInterview(interview: typeof interviews.$inferSelect) {
  return {
    id: interview.id,
    applicationId: interview.applicationId,
    candidateId: interview.candidateId,
    jobId: interview.jobId,
    interviewerId: interview.interviewerId,
    title: interview.title,
    type: interview.type,
    mode: interview.mode,
    status: interview.status,
    scheduledAt: interview.scheduledAt.toISOString(),
    durationMins: interview.durationMins,
    location: interview.location,
    notes: interview.notes,
    source: interview.source,
    meetingUrl: interview.meetLink,
    createdAt: interview.createdAt.toISOString(),
    updatedAt: interview.updatedAt.toISOString(),
  };
}

function calPortalNotification(input: {
  action: CalAction;
  interview: typeof interviews.$inferSelect;
}) {
  const label =
    input.action === "scheduled"
      ? { type: "interview_scheduled", title: "Interview scheduled" }
      : input.action === "rescheduled"
        ? { type: "interview_rescheduled", title: "Interview rescheduled" }
        : { type: "interview_canceled", title: "Interview canceled" };
  return {
    candidateId: input.interview.candidateId,
    type: label.type,
    title: label.title,
    body:
      input.action === "canceled"
        ? "Your interview has been canceled."
        : `${label.title} for ${input.interview.scheduledAt.toISOString()}.`,
    href: `/portal/applications/${input.interview.applicationId}`,
    metadata: {
      interviewId: input.interview.id,
      applicationId: input.interview.applicationId,
    },
  };
}

async function reloadInterview(
  workspaceId: string,
  interviewId: string,
): Promise<typeof interviews.$inferSelect | null> {
  const [interview] = await db
    .select()
    .from(interviews)
    .where(
      and(eq(interviews.workspaceId, workspaceId), eq(interviews.id, interviewId)),
    )
    .limit(1);
  return interview ?? null;
}

async function resolveApplication(input: {
  workspaceId: string;
  metadata: Record<string, unknown>;
  attendees?: CalAttendee[];
}) {
  const metadataApplicationId = asString(input.metadata.applicationId);
  if (metadataApplicationId) {
    const [application] = await db
      .select({
        id: applications.id,
        jobId: applications.jobId,
        candidateId: applications.candidateId,
        email: candidates.email,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        companyName: organization.name,
        jobTitle: jobs.title,
      })
      .from(applications)
      .innerJoin(
        candidates,
        and(
          eq(candidates.id, applications.candidateId),
          eq(candidates.workspaceId, input.workspaceId),
          isNull(candidates.deletedAt),
        ),
      )
      .innerJoin(
        jobs,
        and(
          eq(jobs.id, applications.jobId),
          eq(jobs.workspaceId, input.workspaceId),
          isNull(jobs.deletedAt),
        ),
      )
      .innerJoin(organization, eq(organization.id, input.workspaceId))
      .where(
        and(
          eq(applications.id, metadataApplicationId),
          eq(applications.workspaceId, input.workspaceId),
        ),
      )
      .limit(1);
    if (application) return application;
  }

  const attendeeEmail = input.attendees?.find((attendee) => attendee.email)?.email;
  if (!attendeeEmail) return null;

  const [application] = await db
    .select({
      id: applications.id,
      jobId: applications.jobId,
      candidateId: applications.candidateId,
      email: candidates.email,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      companyName: organization.name,
      jobTitle: jobs.title,
    })
    .from(applications)
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, applications.candidateId),
        eq(candidates.workspaceId, input.workspaceId),
        eq(candidates.email, attendeeEmail.toLowerCase()),
        isNull(candidates.deletedAt),
      ),
    )
    .innerJoin(
      jobs,
      and(
        eq(jobs.id, applications.jobId),
        eq(jobs.workspaceId, input.workspaceId),
        isNull(jobs.deletedAt),
      ),
    )
    .innerJoin(organization, eq(organization.id, input.workspaceId))
    .where(eq(applications.workspaceId, input.workspaceId))
    .orderBy(desc(applications.appliedAt))
    .limit(1);
  return application ?? null;
}

async function sendCalInterviewEmail(input: {
  workspaceId: string;
  actorUserId?: string;
  action: CalAction;
  interview: typeof interviews.$inferSelect;
  context: Awaited<ReturnType<typeof resolveApplication>>;
}) {
  if (!input.context?.email) return;
  try {
    const replyTo = await getInboundReplyTo(
      input.workspaceId,
      input.interview.applicationId,
    );
    const outboxId = await enqueueEmailOutbox(
      input.workspaceId,
      `interview.${input.action}`,
      {
        candidateEmail: input.context.email,
        candidateName: `${input.context.firstName} ${input.context.lastName}`.trim(),
        companyName: input.context.companyName,
        jobTitle: input.context.jobTitle,
        interviewType: "Screening interview",
        scheduledAt: input.interview.scheduledAt.toISOString(),
        mode: input.interview.mode,
        location: input.interview.meetLink ?? input.interview.location ?? undefined,
        durationMins: input.interview.durationMins,
        replyTo,
      },
      undefined,
      input.actorUserId,
    );
    await processEmailOutbox({ ids: [outboxId], workspaceId: input.workspaceId });
  } catch (error) {
    log.error(error, "Cal.com interview email failed after commit");
  }
}

async function syncCalCalendar(input: {
  workspaceId: string;
  action: CalAction;
  interview: typeof interviews.$inferSelect;
  attendees?: CalAttendee[];
}) {
  const attendeeEmails = (input.attendees ?? [])
    .map((attendee) => attendee.email)
    .filter((email): email is string => Boolean(email));

  if (input.action === "canceled") {
    if (!input.interview.gcalEventId) return;
    await trackInterviewSync({
      workspaceId: input.workspaceId,
      interviewId: input.interview.id,
      provider: "google_calendar",
      operation: "cancel",
      run: () =>
        cancelInterviewGCalEvent({
          workspaceId: input.workspaceId,
          interviewId: input.interview.id,
          gcalEventId: input.interview.gcalEventId!,
        }),
      isSuccess: Boolean,
    });
    return;
  }

  if (input.action === "rescheduled" && input.interview.gcalEventId) {
    await trackInterviewSync({
      workspaceId: input.workspaceId,
      interviewId: input.interview.id,
      provider: "google_calendar",
      operation: "upsert",
      run: () =>
        updateInterviewGCalEvent({
          workspaceId: input.workspaceId,
          gcalEventId: input.interview.gcalEventId!,
          start: input.interview.scheduledAt,
          durationMins: input.interview.durationMins,
          attendees: attendeeEmails.length > 0 ? attendeeEmails : undefined,
          location: input.interview.location ?? undefined,
          timeZone: "UTC",
        }),
      isSuccess: Boolean,
    });
    return;
  }

  await trackInterviewSync({
    workspaceId: input.workspaceId,
    interviewId: input.interview.id,
    provider: "google_calendar",
    operation: "upsert",
    run: () =>
      syncInterviewToGCal({
        workspaceId: input.workspaceId,
        interviewId: input.interview.id,
        summary: input.interview.title ?? "Interview",
        start: input.interview.scheduledAt,
        durationMins: input.interview.durationMins,
        attendees: attendeeEmails.length > 0 ? attendeeEmails : undefined,
        location: input.interview.location ?? undefined,
        // Cal.com owns the conferencing URL, when one exists. Do not create a
        // second Google Meet and overwrite the Cal link on the interview.
        mode: undefined,
        timeZone: "UTC",
      }),
    isSuccess: (result) => result.ok,
    resourceId: (result) => (result.ok ? result.eventId : undefined),
    resourceUrl: (result) => (result.ok ? result.meetLink : undefined),
  });
}

export async function POST(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get("ws");
  if (!workspaceId) {
    return NextResponse.json({ error: "Missing workspace." }, { status: 400 });
  }

  const rawBody = await request.text();
  const [settings] = await db
    .select({ secret: workspaceSettings.calWebhookSecret })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  if (!settings?.secret) {
    return NextResponse.json({ error: "Cal.com not configured." }, { status: 404 });
  }

  const signature = request.headers.get("x-cal-signature-256");
  if (!verifyCalSignature(rawBody, signature, settings.secret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let body: CalWebhookBody;
  try {
    body = JSON.parse(rawBody) as CalWebhookBody;
  } catch (error) {
    log.error(error, "cal webhook JSON parse failed");
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const action = actionForEvent(body.triggerEvent ?? "");
  const payload = body.payload ?? {};
  const uid = asString(payload.uid);
  if (!uid) return NextResponse.json({ ok: true, skipped: "no booking uid" });
  if (!action) {
    return NextResponse.json({ ok: true, skipped: body.triggerEvent ?? "unknown" });
  }

  const currentWhere = and(
    eq(interviews.workspaceId, workspaceId),
    eq(interviews.calBookingUid, uid),
    activeCandidateForInterview(workspaceId),
  );

  if (action === "canceled") {
    const transition = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(interviews).where(currentWhere).limit(1);
      if (!current || current.status !== "scheduled") {
        return { changed: false as const, interview: current ?? null, event: null };
      }
      const [updated] = await tx
        .update(interviews)
        .set({ status: "canceled", updatedAt: new Date() })
        .where(
          and(
            eq(interviews.id, current.id),
            eq(interviews.status, "scheduled"),
          ),
        )
        .returning();
      if (!updated) return { changed: false as const, interview: current, event: null };
      await tx.insert(activityEvents).values({
        workspaceId,
        actorId: null,
        entityType: "application",
        entityId: updated.applicationId,
        type: "interview.canceled",
        metadata: { interviewId: updated.id, via: "cal.com" },
      });
      await tx.insert(candidatePortalNotifications).values({
        workspaceId,
        ...calPortalNotification({ action, interview: updated }),
      });
      return {
        changed: true as const,
        interview: updated,
        event: await persistDomainEvent(tx, {
          name: "interview.canceled",
          workspaceId,
          aggregateType: "interview",
          aggregateId: updated.id,
          payload: { interview: serializeCalInterview(updated) },
        }),
      };
    });

    if (!transition.changed || !transition.interview || !transition.event) {
      return NextResponse.json({ ok: true, skipped: "already terminal or inactive" });
    }
    await publishPersistedDomainEvents([transition.event]);
    await syncCalCalendar({ workspaceId, action, interview: transition.interview });
    const latest =
      (await reloadInterview(workspaceId, transition.interview.id)) ??
      transition.interview;
    const context = await resolveApplication({
      workspaceId,
      metadata: { applicationId: latest.applicationId },
    });
    await sendCalInterviewEmail({ workspaceId, action, interview: latest, context });
    await emitWebhookEvent(workspaceId, "interview.canceled", {
      interview: serializeCalInterview(latest),
    }, { skipDomainEvent: true });
    return NextResponse.json({ ok: true });
  }

  const when = payload.startTime ? new Date(payload.startTime) : null;
  if (!when || Number.isNaN(when.getTime())) {
    return NextResponse.json({ ok: true, skipped: "no start time" });
  }
  const end = payload.endTime ? new Date(payload.endTime) : null;
  const durationMins =
    end && !Number.isNaN(end.getTime()) && end.getTime() > when.getTime()
      ? Math.max(5, Math.round((end.getTime() - when.getTime()) / 60000))
      : 45;

  const [existing] = await db
    .select()
    .from(interviews)
    .where(currentWhere)
    .limit(1);
  if (existing && (existing.status !== "scheduled" || action === "scheduled")) {
    return NextResponse.json({ ok: true, skipped: "duplicate or terminal booking" });
  }
  if (existing && action === "rescheduled") {
    const transition = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(interviews)
        .where(currentWhere)
        .limit(1);
      if (!current || current.status !== "scheduled") {
        return { changed: false as const, interview: current ?? null, event: null };
      }
      const nextLocation = asString(payload.location) ?? current.location;
      if (
        current.scheduledAt.getTime() === when.getTime() &&
        current.durationMins === durationMins &&
        current.location === nextLocation
      ) {
        return { changed: false as const, interview: current, event: null };
      }
      const [updated] = await tx
        .update(interviews)
        .set({
          scheduledAt: when,
          durationMins,
          location: nextLocation,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(interviews.id, current.id),
            eq(interviews.status, "scheduled"),
          ),
        )
        .returning();
      if (!updated) return { changed: false as const, interview: current, event: null };
      await tx.insert(activityEvents).values({
        workspaceId,
        actorId: null,
        entityType: "application",
        entityId: updated.applicationId,
        type: "interview.rescheduled",
        metadata: { interviewId: updated.id, via: "cal.com" },
      });
      await tx.insert(candidatePortalNotifications).values({
        workspaceId,
        ...calPortalNotification({ action, interview: updated }),
      });
      return {
        changed: true as const,
        interview: updated,
        event: await persistDomainEvent(tx, {
          name: "interview.rescheduled",
          workspaceId,
          aggregateType: "interview",
          aggregateId: updated.id,
          payload: { interview: serializeCalInterview(updated) },
        }),
      };
    });

    if (!transition.changed || !transition.interview || !transition.event) {
      return NextResponse.json({ ok: true, skipped: "already terminal or inactive" });
    }
    await publishPersistedDomainEvents([transition.event]);
    await syncCalCalendar({
      workspaceId,
      action,
      interview: transition.interview,
      attendees: payload.attendees,
    });
    const latest =
      (await reloadInterview(workspaceId, transition.interview.id)) ??
      transition.interview;
    const context = await resolveApplication({
      workspaceId,
      metadata: { applicationId: latest.applicationId },
    });
    await sendCalInterviewEmail({ workspaceId, action, interview: latest, context });
    await emitWebhookEvent(workspaceId, "interview.rescheduled", {
      interview: serializeCalInterview(latest),
    }, { skipDomainEvent: true });
    return NextResponse.json({ ok: true });
  }

  if (action === "rescheduled") {
    // An out-of-order reschedule must not manufacture a new interview.
    return NextResponse.json({ ok: true, skipped: "unknown booking reschedule" });
  }

  const application = await resolveApplication({
    workspaceId,
    metadata: payload.metadata ?? {},
    attendees: payload.attendees,
  });
  if (!application) {
    return NextResponse.json({ ok: true, skipped: "could not resolve candidate" });
  }

  const transition = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(interviews).where(currentWhere).limit(1);
    if (current) return { changed: false as const, interview: current, event: null };
    const [created] = await tx
      .insert(interviews)
      .values({
        workspaceId,
        applicationId: application.id,
        jobId: application.jobId,
        candidateId: application.candidateId,
        title: asString(payload.title),
        type: "screening",
        mode: inferMode(asString(payload.location)),
        status: "scheduled",
        scheduledAt: when,
        durationMins,
        location: asString(payload.location),
        source: "cal.com",
        calBookingUid: uid,
      })
      .onConflictDoNothing({
        target: [interviews.workspaceId, interviews.calBookingUid],
      })
      .returning();
    if (!created) return { changed: false as const, interview: null, event: null };
    await tx.insert(activityEvents).values({
      workspaceId,
      actorId: null,
      entityType: "application",
      entityId: created.applicationId,
      type: "interview.scheduled",
      metadata: { interviewId: created.id, via: "cal.com" },
    });
    await tx.insert(candidatePortalNotifications).values({
      workspaceId,
      ...calPortalNotification({ action, interview: created }),
    });
    return {
      changed: true as const,
      interview: created,
      event: await persistDomainEvent(tx, {
        name: "interview.scheduled",
        workspaceId,
        aggregateType: "interview",
        aggregateId: created.id,
        payload: { interview: serializeCalInterview(created) },
      }),
    };
  });

  if (!transition.changed || !transition.interview || !transition.event) {
    return NextResponse.json({ ok: true, skipped: "duplicate booking" });
  }
  await publishPersistedDomainEvents([transition.event]);
  await syncCalCalendar({
    workspaceId,
    action,
    interview: transition.interview,
    attendees: payload.attendees,
  });
  const latest =
    (await reloadInterview(workspaceId, transition.interview.id)) ??
    transition.interview;
  await sendCalInterviewEmail({
    workspaceId,
    action,
    interview: latest,
    context: application,
  });
  await emitWebhookEvent(workspaceId, "interview.scheduled", {
    interview: serializeCalInterview(latest),
  }, { skipDomainEvent: true });
  return NextResponse.json({ ok: true });
}
