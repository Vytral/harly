import { Button, Section, Text } from "@react-email/components";

import { buttonStyle, heading, text } from "./styles";
import { WorkspaceLayout } from "./WorkspaceLayout";

export type ApplicationReceivedCandidateProps = {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  companyLogoUrl?: string;
  accentColor?: string;
  jobBoardUrl?: string;
};

export function applicationReceivedCandidateSubject({
  jobTitle,
}: Pick<ApplicationReceivedCandidateProps, "jobTitle">) {
  return `We received your application — ${jobTitle}`;
}

export function ApplicationReceivedCandidate({
  candidateName,
  jobTitle,
  companyName,
  companyLogoUrl,
  accentColor,
  jobBoardUrl,
}: ApplicationReceivedCandidateProps) {
  return (
    <WorkspaceLayout
      preview={`Your application for ${jobTitle} at ${companyName} is confirmed.`}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      accentColor={accentColor}
    >
      <Text style={heading}>Application received</Text>
      <Text style={text}>Hi {candidateName},</Text>
      <Text style={text}>
        Thanks for applying to <strong>{jobTitle}</strong> at {companyName}. We
        have received your application and the hiring team will review it.
      </Text>
      <Text style={text}>
        If there is a fit, {companyName} will follow up with next steps.
      </Text>
      {jobBoardUrl ? (
        <Section style={{ marginTop: "24px" }}>
          <Button href={jobBoardUrl} style={buttonStyle(accentColor)}>
            View open roles
          </Button>
        </Section>
      ) : null}
    </WorkspaceLayout>
  );
}
