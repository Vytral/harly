import "server-only";

import { inArray } from "drizzle-orm";

import { db, emailOutbox } from "@harly/db";

import { createLogger } from "@/lib/logger";
import { emailDeliveryWarning } from "@/lib/email/delivery-warning";
import { withDeliveryBudget } from "@/lib/email/delivery-budget";
import {
  enqueueEmailOutbox,
  processEmailOutbox,
} from "@/lib/email/outbox-processor";

const log = createLogger("pipeline-emails");

const CANDIDATE_EMAIL_LABEL = "candidate email";

export type PipelineEmail = (
  | {
      type: "stage";
      applicationId: string;
      candidateEmail: string;
      candidateName: string;
      jobTitle: string;
      stageName: string;
      workspaceName: string;
    }
  | {
      type: "rejected";
      applicationId: string;
      candidateEmail: string;
      candidateName: string;
      jobTitle: string;
      workspaceName: string;
    }
) & {
  /**
   * Durable id of the change this email announces: the `application_stage_history`
   * row for a stage move, or a fresh id when the change wrote no history row.
   * It is the outbox dedupe key, so a retry of the same change reuses one email
   * and a repeat of an identical move sends a new one.
   */
  eventId: string;
};

export type PipelineEmailSummary = {
  /** Outbox rows created for this stage change. */
  queued: number;
  /** Rows the provider accepted during this call. `null` when that is not known yet. */
  sent: number | null;
  /** Rows that ended in a terminal failure, or could not be queued at all. */
  failed: number;
  /** Non-blocking copy for the recruiter; undefined when every email was sent. */
  emailWarning?: string;
};

const NOT_QUEUED_WARNING = `The ${CANDIDATE_EMAIL_LABEL} could not be queued and will not be sent automatically. Send it manually or review Settings → Email → Delivery log.`;
const SLOW_WARNING = `The ${CANDIDATE_EMAIL_LABEL} is queued. Delivery is taking longer than usual and will continue in the background.`;
const UNCONFIRMED_WARNING = `The ${CANDIDATE_EMAIL_LABEL} is queued, but its delivery could not be confirmed. It will be retried automatically; check the Delivery log if it does not arrive.`;

/**
 * Enqueue and attempt delivery of candidate-facing pipeline emails, waiting at
 * most `DELIVERY_BUDGET_MS` inline. The stage change is already committed when
 * this runs, so it never throws: a queueing or delivery problem is logged and
 * returned as an accurate `emailWarning` for the recruiter.
 */
export async function sendPipelineEmails(
  workspaceId: string,
  emails: PipelineEmail[],
  actorId?: string,
): Promise<PipelineEmailSummary> {
  if (emails.length === 0) return { queued: 0, sent: 0, failed: 0 };

  const ids: string[] = [];
  try {
    for (const email of emails) {
      ids.push(
        await enqueueEmailOutbox(
          workspaceId,
          email.type === "stage" ? "pipeline.stage" : "pipeline.rejected",
          {
            candidateEmail: email.candidateEmail,
            candidateName: email.candidateName,
            applicationId: email.applicationId,
            jobTitle: email.jobTitle,
            stageName: email.type === "stage" ? email.stageName : undefined,
            workspaceName: email.workspaceName,
            type: email.type,
          },
          `pipeline:${email.eventId}`,
          actorId,
        ),
      );
    }
  } catch (error) {
    log.error(error, "pipeline candidate email could not be queued");
    return {
      queued: ids.length,
      sent: ids.length === 0 ? 0 : null,
      failed: emails.length - ids.length,
      emailWarning: ids.length === 0 ? NOT_QUEUED_WARNING : UNCONFIRMED_WARNING,
    };
  }

  const unqueued = emails.length - ids.length;
  let processed;
  try {
    const outcome = await withDeliveryBudget(processEmailOutbox({ ids, workspaceId }));
    if (outcome.timedOut) {
      return { queued: ids.length, sent: null, failed: unqueued, emailWarning: SLOW_WARNING };
    }
    processed = outcome.value;
  } catch (error) {
    // The rows exist, so the outbox owns them now. Their state is unknown here.
    log.error(error, "pipeline candidate email processing failed after it was queued");
    return { queued: ids.length, sent: null, failed: unqueued, emailWarning: UNCONFIRMED_WARNING };
  }

  try {
    const states = await db
      .select({ status: emailOutbox.status })
      .from(emailOutbox)
      .where(inArray(emailOutbox.id, ids));
    const failed = states.filter((state) => state.status === "failed").length;
    return {
      queued: ids.length,
      sent: processed.sent,
      failed: failed + unqueued,
      emailWarning: emailDeliveryWarning(CANDIDATE_EMAIL_LABEL, states),
    };
  } catch (error) {
    log.error(error, "pipeline candidate email state could not be read");
    return { queued: ids.length, sent: null, failed: unqueued, emailWarning: UNCONFIRMED_WARNING };
  }
}

