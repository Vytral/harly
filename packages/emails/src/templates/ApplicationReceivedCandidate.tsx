import { Button, Section, Text } from "@react-email/components";

import { buttonStyle, heading, text } from "./styles";
import { WorkspaceLayout } from "./WorkspaceLayout";
import type { SocialLink } from "./HarlyLayout";

export type ApplicationReceivedCandidateProps = {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  companyLogoUrl?: string;
  accentColor?: string;
  socialLinks?: SocialLink[];
  jobBoardUrl?: string;
};

export function applicationReceivedCandidateSubject({
  jobTitle,
  companyName,
}: Pick<ApplicationReceivedCandidateProps, "jobTitle" | "companyName">) {
  return `Got your application — ${jobTitle} at ${companyName}`;
}

export function ApplicationReceivedCandidate({
  candidateName,
  jobTitle,
  companyName,
  companyLogoUrl,
  accentColor,
  socialLinks,
  jobBoardUrl,
}: ApplicationReceivedCandidateProps) {
  return (
    <WorkspaceLayout
      preview={`Your application for ${jobTitle} is in. We'll be in touch.`}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      accentColor={accentColor}
      socialLinks={socialLinks}
    >
      <Text style={heading}>Application received</Text>
      <Text style={text}>Hi {candidateName},</Text>
      <Text style={text}>
        We got your application for <strong>{jobTitle}</strong>. The team will
        review it and reach out if there&apos;s a fit.
      </Text>
      <Text style={text}>Thanks for taking the time — we appreciate it.</Text>
      {jobBoardUrl ? (
        <Section style={{ marginTop: "24px" }}>
          <Button href={jobBoardUrl} style={buttonStyle(accentColor)}>
            See other open roles
          </Button>
        </Section>
      ) : null}
    </WorkspaceLayout>
  );
}

ApplicationReceivedCandidate.PreviewProps = {
  candidateName: "Ava Thompson",
  jobTitle: "Senior Frontend Engineer",
  companyName: "Acme Inc.",
  jobBoardUrl: "https://acme.com/careers",
} satisfies ApplicationReceivedCandidateProps;
