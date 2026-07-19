import { Button, Section, Text } from "@react-email/components";

import { buttonStyle, heading, muted, strong, text } from "./styles";
import { HarlyLayout, type WorkspaceEmailBranding } from "./HarlyLayout";

export type ApplicationReceivedRecruiterProps = {
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  dashboardUrl: string;
  branding?: WorkspaceEmailBranding;
};

export function applicationReceivedRecruiterSubject({
  candidateName,
  jobTitle,
}: Pick<ApplicationReceivedRecruiterProps, "candidateName" | "jobTitle">) {
  return `${candidateName} applied for ${jobTitle}`;
}

export function ApplicationReceivedRecruiter({
  candidateName,
  candidateEmail,
  jobTitle,
  dashboardUrl,
  branding,
}: ApplicationReceivedRecruiterProps) {
  return (
    <HarlyLayout
      preview={`${candidateName} just applied for ${jobTitle}.`}
      branding={branding}
    >
      <Text style={heading}>New application</Text>
      <Text style={text}>
        <strong style={strong}>{candidateName}</strong> applied for{" "}
        <strong style={strong}>{jobTitle}</strong>.
      </Text>
      <Text style={muted}>
        <a href={`mailto:${candidateEmail}`} style={{ color: muted.color }}>
          {candidateEmail}
        </a>
      </Text>
      <Section style={{ marginTop: "12px" }}>
        <Button href={dashboardUrl} style={buttonStyle(branding?.primaryColor ?? undefined)}>
          Review application  →
        </Button>
      </Section>
    </HarlyLayout>
  );
}

ApplicationReceivedRecruiter.PreviewProps = {
  candidateName: "Ava Thompson",
  candidateEmail: "ava@example.com",
  jobTitle: "Senior Frontend Engineer",
  dashboardUrl: "https://app.harly.dev/dashboard/candidates/123",
} satisfies ApplicationReceivedRecruiterProps;
