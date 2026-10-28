import "server-only";

import {
  enqueueEmailOutbox,
  processEmailOutbox,
} from "@/lib/email/outbox-processor";

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

/**
 * Enqueue and immediately attempt delivery of candidate-facing pipeline emails.
 * Kept out of the "use server" actions module so email delivery behavior has a
 * single owner independent of stage-transition logic.
 */
export async function sendPipelineEmails(
  workspaceId: string,
  emails: PipelineEmail[],
  actorId?: string,
) {
  if (emails.length === 0) return;

  const ids: string[] = [];
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

  await processEmailOutbox({ ids, workspaceId });
}
