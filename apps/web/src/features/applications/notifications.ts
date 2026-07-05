import "server-only";

import { createElement } from "react";

import {
  ApplicationReceivedCandidate,
  ApplicationReceivedRecruiter,
  applicationReceivedCandidateSubject,
  applicationReceivedRecruiterSubject,
} from "@harly/emails";

import { sendWorkspaceEmail } from "@/lib/email";
import { getWorkspaceEmailBranding } from "@/lib/email/branding";
import type { PublicApplicationResult } from "@/features/applications/data";

type ApplicationEmail = Extract<
  PublicApplicationResult,
  { ok: true }
>["email"];

/**
 * Fire the candidate confirmation + recruiter notification emails for a freshly
 * submitted application. Shared by the public apply server action and the public
 * REST intake endpoint so both behave identically. Fire-and-forget.
 */
export function sendApplicationReceivedEmails(email: ApplicationEmail): void {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const jobBoardUrl = `${appUrl}/board/${email.workspaceSlug}`;
  const dashboardUrl = `${appUrl}/dashboard/candidates`;

  void (async () => {
    const branding = await getWorkspaceEmailBranding(email.workspaceId);

    await Promise.allSettled([
      sendWorkspaceEmail(email.workspaceId, {
        to: email.candidateEmail,
        subject: applicationReceivedCandidateSubject({ jobTitle: email.jobTitle, companyName: email.workspaceName }),
        react: createElement(ApplicationReceivedCandidate, {
          candidateName: email.candidateFirstName,
          jobTitle: email.jobTitle,
          companyName: email.workspaceName,
          companyLogoUrl: branding.logoUrl ?? undefined,
          accentColor: branding.primaryColor ?? undefined,
          socialLinks: branding.socialLinks,
          jobBoardUrl,
        }),
      }),
      ...email.ownerEmails.map((ownerEmail) =>
        sendWorkspaceEmail(email.workspaceId, {
          to: ownerEmail,
          subject: applicationReceivedRecruiterSubject({
            candidateName: email.candidateName,
            jobTitle: email.jobTitle,
          }),
          react: createElement(ApplicationReceivedRecruiter, {
            candidateName: email.candidateName,
            candidateEmail: email.candidateEmail,
            jobTitle: email.jobTitle,
            dashboardUrl,
            branding,
          }),
        }),
      ),
    ]);
  })();
}
