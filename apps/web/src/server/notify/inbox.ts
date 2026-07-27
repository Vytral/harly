import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db, notifications, member, jobHiringTeam } from "@harly/db";

import {
  WEBHOOK_EVENT_LABELS,
  type WebhookEvent,
} from "@/server/webhooks/events";
import { emitRealtimeInvalidation } from "@/server/events/emit";
import { REALTIME_EVENTS } from "@/server/events/registry";

type NotifyParams = {
  workspaceId: string;
  recipientIds: string[];
  actorId?: string;
  type: string;
  title: string;
  body?: string;
  href?: string;
  metadata?: Record<string, unknown>;
  dedupeKey?: string;
};

export async function createNotification(params: NotifyParams): Promise<void> {
  const { recipientIds, ...rest } = params;
  if (recipientIds.length === 0) return;

  const unique = [...new Set(recipientIds)];

  await db
    .insert(notifications)
    .values(
      unique.map((userId) => ({
        ...rest,
        userId,
        actorId: rest.actorId ?? null,
        body: rest.body ?? null,
        href: rest.href ?? null,
        metadata: rest.metadata ?? null,
        dedupeKey: rest.dedupeKey ?? null,
      })),
    )
    .onConflictDoNothing({
      target: [
        notifications.workspaceId,
        notifications.userId,
        notifications.dedupeKey,
      ],
    });

  void emitRealtimeInvalidation({
    eventName: REALTIME_EVENTS.NOTIFICATIONS_INVALIDATE,
    workspaceId: rest.workspaceId,
  }).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Recipient resolution
// ---------------------------------------------------------------------------

async function getWorkspaceMemberIds(workspaceId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: member.userId })
    .from(member)
    .where(eq(member.organizationId, workspaceId));
  return rows.map((r) => r.userId);
}

/** Owners/admins receive workspace-wide events, regardless of job assignment. */
async function getWorkspaceAdminIds(workspaceId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: member.userId })
    .from(member)
    .where(
      and(
        eq(member.organizationId, workspaceId),
        sql`${member.role} in ('owner', 'admin')`,
      ),
    );
  return rows.map((r) => r.userId);
}

async function getJobTeamMemberIds(
  workspaceId: string,
  jobId: string,
): Promise<string[]> {
  const rows = await db
    .select({ userId: jobHiringTeam.userId })
    .from(jobHiringTeam)
    .where(
      and(
        eq(jobHiringTeam.workspaceId, workspaceId),
        eq(jobHiringTeam.jobId, jobId),
      ),
    );
  return rows.map((r) => r.userId);
}

/**
 * Notify the hiring team when a candidate reply reaches the workspace.
 * This bypasses the outbound-webhook event registry deliberately: inbound
 * email is a first-class mailbox concern, not an externally delivered event.
 */
export async function notifyInboundEmail(params: {
  workspaceId: string;
  jobId: string;
  candidateId: string;
  candidateName: string;
  subject: string;
  messageId?: string;
  threadId?: string;
}): Promise<void> {
  try {
    let recipientIds = await getJobTeamMemberIds(
      params.workspaceId,
      params.jobId,
    );
    if (recipientIds.length === 0) {
      recipientIds = await getWorkspaceMemberIds(params.workspaceId);
    }

    await createNotification({
      workspaceId: params.workspaceId,
      recipientIds,
      type: "email.received",
      title: `${params.candidateName} replied`,
      body: params.subject || "New candidate reply",
      href: params.threadId
        ? `/dashboard/inbox?thread=${params.threadId}`
        : `/dashboard/candidates/${params.candidateId}`,
      metadata: {
        candidateId: params.candidateId,
        jobId: params.jobId,
        threadId: params.threadId ?? null,
      },
      dedupeKey: params.messageId ? `email:${params.messageId}` : undefined,
    });
  } catch (error) {
    console.error("[notify] inbound email notify failed", {
      workspaceId: params.workspaceId,
      error,
    });
  }
}

// ---------------------------------------------------------------------------
// Event → in-app notification bridge
// ---------------------------------------------------------------------------

type EventPayload = Record<string, unknown>;

function extractIds(data: EventPayload) {
  const candidate = data.candidate as Record<string, unknown> | undefined;
  const application = data.application as Record<string, unknown> | undefined;
  const job = data.job as Record<string, unknown> | undefined;
  const interview = data.interview as Record<string, unknown> | undefined;

  const candidateName =
    (candidate?.name as string) ??
    (application?.candidateName as string) ??
    (data.candidateName as string) ??
    null;
  const jobTitle =
    (job?.title as string) ??
    (application?.jobTitle as string) ??
    (data.jobTitle as string) ??
    null;
  const jobId =
    (job?.id as string) ??
    (application?.jobId as string) ??
    (interview?.jobId as string) ??
    (data.jobId as string) ??
    null;
  const candidateId =
    (candidate?.id as string) ??
    (application?.candidateId as string) ??
    (data.candidateId as string) ??
    null;

  return { candidateName, jobTitle, jobId, candidateId };
}

function buildTitle(
  event: WebhookEvent,
  candidateName: string | null,
  jobTitle: string | null,
): string {
  const label = WEBHOOK_EVENT_LABELS[event] ?? event;

  if (event === "application.created" && candidateName) {
    return `${candidateName} applied`;
  }
  if (event === "application.hired" && candidateName) {
    return `${candidateName} was hired`;
  }
  if (event === "application.rejected" && candidateName) {
    return `${candidateName} was rejected`;
  }
  if (event === "application.stage_changed" && candidateName && jobTitle) {
    return `${candidateName} moved stage , ${jobTitle}`;
  }
  if (event === "application.stage_changed" && candidateName) {
    return `${candidateName} moved stage`;
  }
  if (event === "candidate.created" && candidateName) {
    return `${candidateName} added as candidate`;
  }
  if (event === "interview.scheduled" && candidateName) {
    return `Interview with ${candidateName}`;
  }
  if (event === "interview.canceled" && candidateName) {
    return `Interview with ${candidateName} canceled`;
  }
  if (event === "interview.completed" && candidateName) {
    return `Interview with ${candidateName} completed`;
  }
  if (event === "interview.rescheduled" && candidateName) {
    return `Interview with ${candidateName} rescheduled`;
  }
  if (event === "job.published" && jobTitle) {
    return `${jobTitle} published`;
  }

  return label;
}

function buildDetail(
  candidateName: string | null,
  jobTitle: string | null,
): string | null {
  if (candidateName && jobTitle) return `${jobTitle}`;
  return candidateName ?? jobTitle ?? null;
}

function buildHref(event: WebhookEvent, data: EventPayload): string | null {
  const { candidateId } = extractIds(data);
  if (candidateId) return `/dashboard/candidates/${candidateId}`;
  if (event === "job.published") {
    const job = data.job as Record<string, unknown> | undefined;
    if (job?.id) return `/dashboard/jobs/${job.id}`;
  }
  return "/dashboard/inbox";
}

async function resolveRecipients(
  workspaceId: string,
  event: WebhookEvent,
  data: EventPayload,
  actorId?: string,
): Promise<string[]> {
  const { jobId } = extractIds(data);

  let ids: string[];

  if (jobId && event !== "job.published") {
    ids = await getJobTeamMemberIds(workspaceId, jobId);
    if (ids.length === 0) {
      ids = await getWorkspaceMemberIds(workspaceId);
    }
  } else {
    ids = await getWorkspaceMemberIds(workspaceId);
  }

  // Workspace oversight: owners/admins always see every event, including
  // interview schedule/reschedule/cancel/complete changes.
  ids = [...new Set([...ids, ...(await getWorkspaceAdminIds(workspaceId))])];

  // Never notify the actor about their own action.
  if (actorId) {
    ids = ids.filter((id) => id !== actorId);
  }

  return ids;
}

/**
 * Create in-app notifications for a webhook event.
 * Fire-and-forget , never throws.
 */
export async function notifyInboxEvent(
  workspaceId: string,
  event: WebhookEvent,
  data: EventPayload,
  actorId?: string,
  eventId?: string,
): Promise<void> {
  try {
    const recipientIds = await resolveRecipients(
      workspaceId,
      event,
      data,
      actorId,
    );
    if (recipientIds.length === 0) return;

    const { candidateName, jobTitle } = extractIds(data);
    const title = buildTitle(event, candidateName, jobTitle);
    const body = buildDetail(candidateName, jobTitle);
    const href = buildHref(event, data);

    await createNotification({
      workspaceId,
      recipientIds,
      actorId,
      type: event,
      title,
      body: body ?? undefined,
      href: href ?? undefined,
      metadata: { event },
      dedupeKey: eventId ? `event:${eventId}` : undefined,
    });
  } catch (error) {
    console.error("[notify] inbox notify failed", {
      workspaceId,
      event,
      error,
    });
  }
}
