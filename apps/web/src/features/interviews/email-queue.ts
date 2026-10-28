import "server-only";

import { eq } from "drizzle-orm";

import { db, emailOutbox, user as authUsers } from "@harly/db";

import { createLogger } from "@/lib/logger";
import { emailDeliveryWarning } from "@/lib/email/delivery-warning";
import {
  enqueueEmailOutbox,
  processEmailOutbox,
} from "@/lib/email/outbox-processor";
import { resolveInterviewTimeZone } from "@/lib/email/interview-time";

const log = createLogger("interview-email");

const INTERVIEW_EMAIL_LABEL = "interview email";

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
 * Queue an interview email with its resolved zone and attempt delivery now.
 * Never throws: the interview change is already saved, so failures become a
 * warning for the recruiter.
 */
export async function queueInterviewEmail(
  workspaceId: string,
  kind: InterviewEmailKind,
  payload: Record<string, unknown> & { timeZone?: string | null },
  actorId?: string,
): Promise<InterviewEmailQueueResult> {
  try {
    const timeZone = await resolveInterviewEmailTimeZone(
      typeof payload.timeZone === "string" ? payload.timeZone : null,
      actorId,
    );
    const id = await enqueueEmailOutbox(
      workspaceId,
      kind,
      { ...payload, timeZone },
      undefined,
      actorId,
    );
    await processEmailOutbox({ ids: [id], workspaceId });
    const [state] = await db
      .select({ status: emailOutbox.status })
      .from(emailOutbox)
      .where(eq(emailOutbox.id, id))
      .limit(1);
    if (!state) {
      return {
        status: "failed",
        warning: `The ${INTERVIEW_EMAIL_LABEL} could not be queued and will not be sent automatically.`,
      };
    }
    return {
      status: state.status === "sent" ? "sent" : "failed",
      warning: emailDeliveryWarning(INTERVIEW_EMAIL_LABEL, [state]),
    };
  } catch (error) {
    log.error(error, "Interview email could not be queued");
    return {
      status: "failed",
      warning: `The ${INTERVIEW_EMAIL_LABEL} could not be queued and will not be sent automatically.`,
    };
  }
}
