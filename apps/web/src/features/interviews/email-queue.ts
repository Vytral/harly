import "server-only";

import { randomUUID } from "node:crypto";

import { and, desc, eq, sql } from "drizzle-orm";

import { db, emailOutbox, user as authUsers } from "@harly/db";

import { createLogger } from "@/lib/logger";
import { emailDeliveryWarning } from "@/lib/email/delivery-warning";
import { withDeliveryBudget } from "@/lib/email/delivery-budget";
import {
  enqueueEmailOutbox,
  processEmailOutbox,
} from "@/lib/email/outbox-processor";
import {
  isValidTimeZone,
  resolveInterviewTimeZone,
} from "@/lib/email/interview-time";

const log = createLogger("interview-email");

const INTERVIEW_EMAIL_LABEL = "interview email";
const NOT_QUEUED_WARNING = `The ${INTERVIEW_EMAIL_LABEL} could not be queued and will not be sent automatically.`;
const SLOW_WARNING = `The ${INTERVIEW_EMAIL_LABEL} is queued. Delivery is taking longer than usual and will continue in the background.`;
const UNCONFIRMED_WARNING = `The ${INTERVIEW_EMAIL_LABEL} is queued, but its delivery could not be confirmed. It will be retried automatically; check the Delivery log if it does not arrive.`;

export type InterviewEmailKind =
  | "interview.scheduled"
  | "interview.rescheduled"
  | "interview.canceled";

export type InterviewEmailQueueResult = {
  /** `sent` only when the provider accepted the email during this call. */
  status: "sent" | "failed";
  /** Accurate recruiter copy; undefined when the email was sent. */
  warning?: string;
};

/**
 * The zone the candidate should see: the zone from the scheduling request,
 * then the scheduler's profile zone, then UTC.
 */
export async function resolveInterviewEmailTimeZone(
  requested: string | null | undefined,
  actorUserId?: string | null,
): Promise<string> {
  // A valid zone from the request needs no profile read.
  if (isValidTimeZone(requested)) return requested;
  let profileZone: string | null = null;
  if (actorUserId) {
    try {
      const [profile] = await db
        .select({ timezone: authUsers.timezone })
        .from(authUsers)
        .where(eq(authUsers.id, actorUserId))
        .limit(1);
      profileZone = profile?.timezone ?? null;
    } catch (error) {
      log.warn({ error }, "could not read the scheduler's time zone");
    }
  }
  return resolveInterviewTimeZone(requested, profileZone);
}

/**
 * The zone a candidate email about this interview is written in. Reschedule and
 * cancel emails keep the original invite's zone; a new invite uses the request
 * zone, then the scheduler's profile zone, then UTC. In-app text must call this
 * too, so it shows the same zone as the email.
 */
export async function resolveInterviewEmailZoneFor(input: {
  workspaceId: string;
  kind: InterviewEmailKind;
  interviewId?: string | null;
  requested?: string | null;
  actorId?: string | null;
  database?: typeof db;
}): Promise<string> {
  const original =
    input.kind !== "interview.scheduled" && input.interviewId
      ? await resolveOriginalInviteTimeZone(input.workspaceId, input.interviewId, input.database)
      : null;
  return original ?? (await resolveInterviewEmailTimeZone(input.requested, input.actorId));
}

/**
 * The zone the original invite was sent in, read from its outbox payload.
 * Reschedule and cancel emails use it so the candidate keeps one zone for the
 * interview. Null for invites queued before zones and interview ids were recorded.
 */
export async function resolveOriginalInviteTimeZone(
  workspaceId: string,
  interviewId: string,
  database: typeof db = db,
): Promise<string | null> {
  try {
    const [invite] = await database
      .select({ payload: emailOutbox.payload })
      .from(emailOutbox)
      .where(
        and(
          eq(emailOutbox.workspaceId, workspaceId),
          eq(emailOutbox.kind, "interview.scheduled"),
          sql`${emailOutbox.payload}->>'interviewId' = ${interviewId}`,
        ),
      )
      .orderBy(desc(emailOutbox.createdAt))
      .limit(1);
    const zone = (invite?.payload as { timeZone?: unknown } | null | undefined)?.timeZone;
    return isValidTimeZone(zone) ? zone : null;
  } catch (error) {
    log.warn({ error, interviewId }, "could not read the original invite's time zone");
    return null;
  }
}

/**
 * Durable identity of one interview email. The same action retried reuses the
 * key; an identical re-invite after a cancel has a later `revision` (the
 * interview row's `updatedAt`), so it gets its own email.
 */
export function interviewEmailDedupeKey(input: {
  interviewId: string;
  kind: InterviewEmailKind;
  scheduledAt: string;
  revision: number;
}): string {
  return `interview:${input.interviewId}:${input.kind}:${input.scheduledAt}:${input.revision}`;
}

/**
 * Queue an interview email and attempt delivery for at most `DELIVERY_BUDGET_MS`.
 * Never throws: the interview change is already saved, so every problem becomes
 * an accurate warning for the recruiter.
 */
export async function queueInterviewEmail(
  workspaceId: string,
  kind: InterviewEmailKind,
  payload: Record<string, unknown> & {
    timeZone?: string | null;
    interviewId?: string;
    /** The interview row's `updatedAt` in epoch ms. */
    revision?: number;
  },
  actorId?: string,
  /** The zone the caller already resolved for the in-app text, so it is not looked up twice. */
  resolvedTimeZone?: string | null,
): Promise<InterviewEmailQueueResult> {
  let outboxId: string;
  try {
    const interviewId = typeof payload.interviewId === "string" ? payload.interviewId : null;
    const timeZone = isValidTimeZone(resolvedTimeZone)
      ? resolvedTimeZone
      : await resolveInterviewEmailZoneFor({
          workspaceId,
          kind,
          interviewId,
          requested: typeof payload.timeZone === "string" ? payload.timeZone : null,
          actorId,
        });
    const dedupeKey =
      interviewId && typeof payload.revision === "number"
        ? interviewEmailDedupeKey({
            interviewId,
            kind,
            scheduledAt: String(payload.scheduledAt ?? ""),
            revision: payload.revision,
          })
        : randomUUID();
    outboxId = await enqueueEmailOutbox(
      workspaceId,
      kind,
      { ...payload, timeZone },
      dedupeKey,
      actorId,
    );
  } catch (error) {
    log.error(error, "Interview email could not be queued");
    return { status: "failed", warning: NOT_QUEUED_WARNING };
  }

  try {
    const outcome = await withDeliveryBudget(
      processEmailOutbox({ ids: [outboxId], workspaceId }),
    );
    if (outcome.timedOut) return { status: "failed", warning: SLOW_WARNING };
  } catch (error) {
    // The row exists, so the outbox owns it: it is queued, not lost.
    log.error(error, "Interview email processing failed after it was queued");
    return { status: "failed", warning: UNCONFIRMED_WARNING };
  }

  try {
    const [state] = await db
      .select({ status: emailOutbox.status })
      .from(emailOutbox)
      .where(eq(emailOutbox.id, outboxId))
      .limit(1);
    if (!state) return { status: "failed", warning: UNCONFIRMED_WARNING };
    return {
      status: state.status === "sent" ? "sent" : "failed",
      warning: emailDeliveryWarning(INTERVIEW_EMAIL_LABEL, [state]),
    };
  } catch (error) {
    log.error(error, "Interview email state could not be read");
    return { status: "failed", warning: UNCONFIRMED_WARNING };
  }
}

