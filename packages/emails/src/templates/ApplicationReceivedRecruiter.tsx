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
  return `New application — ${candidateName} for ${jobTitle}`;
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
      preview={`${candidateName} applied for ${jobTitle}. Review their application in Harly.`}
      branding={branding}
    >
      <Text style={heading}>New application</Text>
      <Text style={text}>
        <strong>{candidateName}</strong> applied for{" "}
        <strong>{jobTitle}</strong>.
      </Text>
      <Text style={text}>
        Email:{" "}
        <a
          href={`mailto:${candidateEmail}`}
          style={{ color: "#44403c", textDecoration: "underline" }}
        >
          {candidateEmail}
        </a>
      </Text>
      <Section style={{ marginTop: "24px" }}>
        <Button href={dashboardUrl} style={buttonStyle(branding?.primaryColor || undefined)}>
          Review candidate
        </Button>
      </Section>
    </HarlyLayout>
  );
}
