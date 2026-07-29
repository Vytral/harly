import { NextResponse, type NextRequest } from "next/server";

import { and, desc, eq, exists, isNull } from "drizzle-orm";

import {
  db,
  applications,
  candidates,
  interviews,
  jobs,
  workspaceSettings,
} from "@harly/db";
import { verifyCalSignature } from "@/lib/cal/client";
import {
  syncInterviewToGCal,
  cancelInterviewGCalEvent,
  updateInterviewGCalEvent,
} from "@/lib/gcal/sync";
import { createLogger } from "@/lib/logger";

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

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Best-effort map of a Cal.com location string to our interview mode. */
function inferMode(location: string | null): "video" | "phone" | "onsite" {
  if (!location) return "video";
  const lower = location.toLowerCase();
  if (lower.includes("phone") || lower.includes("tel")) return "phone";
  if (lower.includes("person") || lower.includes("office") || lower.includes("address"))
    return "onsite";
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

export async function POST(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get("ws");
  if (!workspaceId) {
    return NextResponse.json({ error: "Missing workspace." }, { status: 400 });
  }

  // Raw body is required for signature verification , read it as text first.
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

  const event = body.triggerEvent;
  const payload = body.payload ?? {};
  const uid = asString(payload.uid);
  if (!uid) {
    return NextResponse.json({ ok: true, skipped: "no booking uid" });
  }

  // Cancellation: flip status, delete GCal event if synced.
  if (event === "BOOKING_CANCELLED") {
    const [canceled] = await db
      .update(interviews)
      .set({ status: "canceled", updatedAt: new Date() })
      .where(
        and(
          eq(interviews.workspaceId, workspaceId),
          eq(interviews.calBookingUid, uid),
          activeCandidateForInterview(workspaceId),
        ),
      )
      .returning({ id: interviews.id, gcalEventId: interviews.gcalEventId });

    if (canceled?.gcalEventId) {
      void cancelInterviewGCalEvent({
        workspaceId,
        interviewId: canceled.id,
        gcalEventId: canceled.gcalEventId,
      });
    }

    return NextResponse.json({ ok: true });
  }

  if (event !== "BOOKING_CREATED" && event !== "BOOKING_RESCHEDULED") {
    return NextResponse.json({ ok: true, skipped: event ?? "unknown" });
  }

  const when = payload.startTime ? new Date(payload.startTime) : null;
  if (!when || Number.isNaN(when.getTime())) {
    return NextResponse.json({ ok: true, skipped: "no start time" });
  }
  const durationMins =
    payload.endTime && payload.startTime
      ? Math.max(
          5,
          Math.round(
            (new Date(payload.endTime).getTime() - when.getTime()) / 60000,
          ),
        )
      : 45;

  // Reschedule of an interview we already track: move it and sync to GCal.
  if (event === "BOOKING_RESCHEDULED") {
    const moved = await db
      .update(interviews)
      .set({ scheduledAt: when, durationMins, status: "scheduled", updatedAt: new Date() })
      .where(
        and(
          eq(interviews.workspaceId, workspaceId),
          eq(interviews.calBookingUid, uid),
          activeCandidateForInterview(workspaceId),
        ),
      )
      .returning({ id: interviews.id, gcalEventId: interviews.gcalEventId });
    if (moved.length > 0) {
      if (moved[0].gcalEventId) {
        void updateInterviewGCalEvent({
          workspaceId,
          gcalEventId: moved[0].gcalEventId,
          start: when,
          durationMins,
        });
      }
      return NextResponse.json({ ok: true });
    }
    // Unknown booking → fall through and create it.
  }

  // Resolve the application: prefer ids stuffed into the booking metadata, else
  // fall back to matching the attendee email to a candidate in this workspace.
  const metadata = payload.metadata ?? {};
  let applicationId = asString(metadata.applicationId);
  let candidateId = asString(metadata.candidateId);

  if (!applicationId || !candidateId) {
    const attendeeEmail = payload.attendees?.find((a) => a.email)?.email ?? null;
    if (attendeeEmail) {
      const [candidate] = await db
        .select({ id: candidates.id })
        .from(candidates)
        .where(
          and(
            eq(candidates.workspaceId, workspaceId),
            eq(candidates.email, attendeeEmail.toLowerCase()),
            isNull(candidates.deletedAt),
          ),
        )
        .limit(1);
      if (candidate) {
        candidateId = candidate.id;
          const [application] = await db
            .select({ id: applications.id })
            .from(applications)
            .innerJoin(
              jobs,
              and(
                eq(jobs.id, applications.jobId),
                eq(jobs.workspaceId, workspaceId),
                isNull(jobs.deletedAt),
              ),
            )
            .where(
            and(
              eq(applications.workspaceId, workspaceId),
              eq(applications.candidateId, candidate.id),
            ),
          )
          .orderBy(desc(applications.appliedAt))
          .limit(1);
        applicationId = application?.id ?? null;
      }
    }
  }

  if (!applicationId || !candidateId) {
    return NextResponse.json({ ok: true, skipped: "could not resolve candidate" });
  }

  // Confirm the application belongs to the workspace and grab its job.
  const [application] = await db
    .select({ id: applications.id, jobId: applications.jobId })
    .from(applications)
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .innerJoin(
      jobs,
      and(
        eq(jobs.id, applications.jobId),
        eq(jobs.workspaceId, workspaceId),
        isNull(jobs.deletedAt),
      ),
    )
    .where(
      and(
        eq(applications.id, applicationId),
        eq(applications.workspaceId, workspaceId),
        eq(applications.candidateId, candidateId),
        eq(candidates.workspaceId, workspaceId),
        isNull(candidates.deletedAt),
      ),
    )
    .limit(1);

  if (!application) {
    return NextResponse.json({ ok: true, skipped: "application mismatch" });
  }

  const mode = inferMode(asString(payload.location));

  const [created] = await db
    .insert(interviews)
    .values({
      workspaceId,
      applicationId: application.id,
      jobId: application.jobId,
      candidateId,
      title: asString(payload.title),
      type: "screening",
      mode,
      status: "scheduled",
      scheduledAt: when,
      durationMins,
      location: asString(payload.location),
      source: "cal.com",
      calBookingUid: uid,
    })
    .onConflictDoUpdate({
      // Composite target = the per-workspace unique index, so a uid collision
      // across workspaces can never resolve onto another tenant's row.
      target: [interviews.workspaceId, interviews.calBookingUid],
      set: { scheduledAt: when, durationMins, status: "scheduled", updatedAt: new Date() },
    })
    .returning({ id: interviews.id, gcalEventId: interviews.gcalEventId });

  if (created?.id && !created.gcalEventId) {
    const attendeeEmails = (payload.attendees ?? [])
      .map((a) => a.email)
      .filter((e): e is string => Boolean(e));
    void syncInterviewToGCal({
      workspaceId,
      interviewId: created.id,
      summary: asString(payload.title) ?? "Interview",
      start: when,
      durationMins,
      attendees: attendeeEmails.length > 0 ? attendeeEmails : undefined,
      location: asString(payload.location) ?? undefined,
    });
  }

  return NextResponse.json({ ok: true });
}
