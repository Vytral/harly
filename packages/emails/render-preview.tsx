// Render a representative set of templates to /tmp/email-*.html for visual
// review. Run: `npx tsx packages/emails/render-preview.mts` from packages/emails.
// Not shipped (dev-only). Removed by lint wipes — recreate if missing.
import React from "react";
import { render } from "@react-email/render";
import { writeFileSync } from "node:fs";

import { ApplicationReceivedCandidate } from "./src/templates/ApplicationReceivedCandidate";
import { ApplicationReceivedRecruiter } from "./src/templates/ApplicationReceivedRecruiter";
import { CandidateRejected } from "./src/templates/CandidateRejected";
import { CandidateStageUpdate } from "./src/templates/CandidateStageUpdate";
import { InterviewCanceled } from "./src/templates/InterviewCanceled";
import { InterviewRescheduled } from "./src/templates/InterviewRescheduled";
import { InterviewScheduled } from "./src/templates/InterviewScheduled";
import { OfferExtended } from "./src/templates/OfferExtended";
import { OfferWithdrawn } from "./src/templates/OfferWithdrawn";
import { PortalMagicLinkEmail } from "./src/templates/PortalMagicLink";
import { ResetPasswordEmail } from "./src/templates/ResetPassword";
import { VerifyEmail } from "./src/templates/VerifyEmail";
import { WelcomeEmail } from "./src/templates/WelcomeEmail";
import { WorkspaceInvitation } from "./src/templates/WorkspaceInvitation";

const brand = {
  name: "Acme Inc.",
  logoUrl: undefined as string | undefined,
  primaryColor: undefined as string | undefined,
};

const cases: { file: string; html: Promise<string> }[] = [
  {
    file: "/tmp/email-welcome.html",
    html: render(
      <WelcomeEmail
        userName="Ava"
        workspaceName="Acme Inc."
        dashboardUrl="https://app.harly.dev/dashboard"
        branding={brand}
      />,
    ),
  },
  {
    file: "/tmp/email-verify.html",
    html: render(<VerifyEmail userName="Ava" verifyUrl="https://app.harly.dev/verify?token=abc" />),
  },
  {
    file: "/tmp/email-reset.html",
    html: render(
      <ResetPasswordEmail userName="Ava" resetUrl="https://app.harly.dev/reset?token=abc" />,
    ),
  },
  {
    file: "/tmp/email-magiclink.html",
    html: render(
      <PortalMagicLinkEmail candidateName="Ava" loginUrl="https://app.harly.dev/portal/login?t=abc" />,
    ),
  },
  {
    file: "/tmp/email-invite.html",
    html: render(
      <WorkspaceInvitation
        inviteeName="Ava"
        inviterName="Max"
        workspaceName="Acme Inc."
        role="recruiter"
        acceptUrl="https://app.harly.dev/join?token=abc"
        branding={brand}
      />,
    ),
  },
  {
    file: "/tmp/email-recruiter.html",
    html: render(
      <ApplicationReceivedRecruiter
        candidateName="Ava Thompson"
        candidateEmail="ava@example.com"
        jobTitle="Senior Frontend Engineer"
        dashboardUrl="https://app.harly.dev/dashboard/candidates/123"
        branding={brand}
      />,
    ),
  },
  {
    file: "/tmp/email-app-candidate.html",
    html: render(
      <ApplicationReceivedCandidate
        candidateName="Ava Thompson"
        jobTitle="Senior Frontend Engineer"
        companyName="Acme Inc."
        jobBoardUrl="https://acme.com/careers"
      />,
    ),
  },
  {
    file: "/tmp/email-interview.html",
    html: render(
      <InterviewScheduled
        candidateName="Ava Thompson"
        companyName="Acme Inc."
        jobTitle="Senior Frontend Engineer"
        interviewType="Technical interview"
        when="Thursday, July 3 at 2:00 PM"
        mode="Video call"
        duration="60 minutes"
        location="https://meet.example.com/abc"
        startIso="2026-07-03T14:00:00Z"
        durationMins={60}
      />,
    ),
  },
  {
    file: "/tmp/email-interview-resched.html",
    html: render(
      <InterviewRescheduled
        candidateName="Ava Thompson"
        companyName="Acme Inc."
        jobTitle="Senior Frontend Engineer"
        interviewType="Technical interview"
        when="Friday, July 4 at 3:00 PM"
        mode="Video call"
        duration="60 minutes"
      />,
    ),
  },
  {
    file: "/tmp/email-interview-cancel.html",
    html: render(
      <InterviewCanceled
        candidateName="Ava Thompson"
        companyName="Acme Inc."
        jobTitle="Senior Frontend Engineer"
        interviewType="Technical interview"
        when="Thursday, July 3 at 2:00 PM"
      />,
    ),
  },
  {
    file: "/tmp/email-offer.html",
    html: render(
      <OfferExtended
        candidateName="Ava Thompson"
        companyName="Acme Inc."
        jobTitle="Senior Frontend Engineer"
        salary="$140,000 / year"
        startDate="August 1, 2026"
        expiresAt="July 10, 2026"
        equity="0.15% over 4 years"
        offerUrl="https://app.harly.dev/portal/applications/application-123"
      />,
    ),
  },
  {
    file: "/tmp/email-offer-withdraw.html",
    html: render(
      <OfferWithdrawn
        candidateName="Ava Thompson"
        companyName="Acme Inc."
        jobTitle="Senior Frontend Engineer"
      />,
    ),
  },
  {
    file: "/tmp/email-reject.html",
    html: render(
      <CandidateRejected
        candidateName="Ava Thompson"
        companyName="Acme Inc."
        jobTitle="Senior Frontend Engineer"
      />,
    ),
  },
  {
    file: "/tmp/email-stage.html",
    html: render(
      <CandidateStageUpdate
        candidateName="Ava Thompson"
        companyName="Acme Inc."
        jobTitle="Senior Frontend Engineer"
        stageName="Phone screen"
      />,
    ),
  },
];

async function main() {
  for (const c of cases) {
    const html = await c.html;
    writeFileSync(c.file, html);
    console.log("wrote", c.file);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
