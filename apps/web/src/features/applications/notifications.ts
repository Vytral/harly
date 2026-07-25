import "server-only";

import { enqueueEmailOutbox, processEmailOutbox } from "@/lib/email/outbox-processor";
import type { PublicApplicationResult } from "@/features/applications/data";

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
  const ids: string[] = [
    await enqueueEmailOutbox(email.workspaceId, "application.received.candidate", {
      candidateEmail: email.candidateEmail,
      candidateFirstName: email.candidateFirstName,
      jobTitle: email.jobTitle,
      workspaceName: email.workspaceName,
      workspaceSlug: email.workspaceSlug,
      applicationId: email.applicationId,
      portalEnabled: email.portalEnabled,
    }),
  ];

  for (const ownerEmail of email.ownerEmails) {
    ids.push(
      await enqueueEmailOutbox(email.workspaceId, "application.received.recruiter", {
        ownerEmail,
        candidateName: email.candidateName,
        candidateEmail: email.candidateEmail,
        jobTitle: email.jobTitle,
      }),
    );
  }

  await processEmailOutbox({ ids, workspaceId: email.workspaceId });
}
