import "server-only";

import { applicationReceivedEmailDedupeKey } from "@/lib/email/dedupe-keys";
import { enqueueEmailOutbox, processEmailOutbox } from "@/lib/email/outbox-processor";
import { createLogger } from "@/lib/logger";
import type { PublicApplicationResult } from "@/features/applications/data";

const log = createLogger("application-notifications");

type ApplicationEmail = Extract<
  PublicApplicationResult,
  { ok: true }
>["email"];

/**
 * Enqueue the candidate confirmation + recruiter notification emails for a
 * freshly submitted application as durable outbox rows, then attempt immediate
 * delivery. Shared by the public apply server action and the public REST intake
 * endpoint so both behave identically. Any row the provider rejects stays
 * `pending`/`failed` and is retried by the scheduler (F4-03).
 */
export async function sendApplicationReceivedEmails(
  email: ApplicationEmail & { portalEnabled?: boolean },
): Promise<void> {
  // The application is already saved when this runs. A missing mail provider
  // or an outbox failure must never turn a stored application into an error
  // for the candidate (they would resubmit): log it and carry on.
  try {
    await enqueueAndSend(email);
  } catch (error) {
    log.error(
      { err: error, applicationId: email.applicationId },
      "application received emails failed; application was saved",
    );
  }
}

async function enqueueAndSend(
  email: ApplicationEmail & { portalEnabled?: boolean },
): Promise<void> {
  const ids: string[] = [
    await enqueueEmailOutbox(email.workspaceId, "application.received.candidate", {
      candidateEmail: email.candidateEmail,
      candidateFirstName: email.candidateFirstName,
      jobTitle: email.jobTitle,
      workspaceName: email.workspaceName,
      workspaceSlug: email.workspaceSlug,
      applicationId: email.applicationId,
      portalEnabled: email.portalEnabled,
    }, applicationReceivedEmailDedupeKey({ applicationId: email.applicationId, recipient: "candidate" })),
  ];

  for (const ownerEmail of email.ownerEmails) {
    ids.push(
      await enqueueEmailOutbox(email.workspaceId, "application.received.recruiter", {
        ownerEmail,
        candidateName: email.candidateName,
        candidateEmail: email.candidateEmail,
        jobTitle: email.jobTitle,
      }, applicationReceivedEmailDedupeKey({
        applicationId: email.applicationId,
        recipient: "recruiter",
        recipientEmail: ownerEmail,
      })),
    );
  }

  await processEmailOutbox({ ids, workspaceId: email.workspaceId });
}
