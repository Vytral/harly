import "server-only";

import { inArray } from "drizzle-orm";

import { db, emailOutbox } from "@harly/db";

import { createLogger } from "@/lib/logger";
import { emailDeliveryWarning } from "@/lib/email/delivery-warning";
import {
  enqueueEmailOutbox,
  processEmailOutbox,
} from "@/lib/email/outbox-processor";

const log = createLogger("pipeline-emails");

const CANDIDATE_EMAIL_LABEL = "candidate email";

export type PipelineEmail =
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
    };

export type PipelineEmailSummary = {
  /** Outbox rows created for this stage change. */
  queued: number;
  /** Rows the provider accepted during this call. */
  sent: number;
  /** Rows that ended in a terminal failure, or could not be queued at all. */
  failed: number;
  /** Non-blocking copy for the recruiter; undefined when every email was sent. */
  emailWarning?: string;
};

/**
 * Enqueue and immediately attempt delivery of candidate-facing pipeline emails.
 * The stage change is already committed when this runs, so it never throws:
 * a queueing or delivery problem is logged, summarized, and returned as an
 * `emailWarning` for the recruiter.
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
          undefined,
          actorId,
        ),
      );
    }
    const result = await processEmailOutbox({ ids, workspaceId });
    const states = await db
      .select({ status: emailOutbox.status })
      .from(emailOutbox)
      .where(inArray(emailOutbox.id, ids));
    const failed = states.filter((state) => state.status === "failed").length;
    return {
      queued: ids.length,
      sent: result.sent,
      failed: failed + Math.max(0, emails.length - ids.length),
      emailWarning: emailDeliveryWarning(CANDIDATE_EMAIL_LABEL, states),
    };
  } catch (error) {
    log.error(error, "pipeline candidate email could not be queued");
    return {
      queued: ids.length,
      sent: 0,
      failed: emails.length - ids.length,
      emailWarning: `The ${CANDIDATE_EMAIL_LABEL} could not be queued and will not be sent automatically. Send it manually or review Settings → Email → Delivery log.`,
    };
  }
}
