import { Button, Section, Text } from "@react-email/components";

import { buttonStyle, heading, text } from "./styles";
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
        <strong>{candidateName}</strong> applied for <strong>{jobTitle}</strong>.
      </Text>
      <Text style={{ ...text, color: "#78716c" }}>
        <a href={`mailto:${candidateEmail}`} style={{ color: "#78716c" }}>
          {candidateEmail}
        </a>
      </Text>
      <Section style={{ marginTop: "24px" }}>
        <Button href={dashboardUrl} style={buttonStyle(branding?.primaryColor ?? undefined)}>
          Review application
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
