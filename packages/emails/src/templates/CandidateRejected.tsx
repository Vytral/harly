import { Text } from "@react-email/components";

import { heading, text } from "./styles";
import { WorkspaceLayout } from "./WorkspaceLayout";
import type { SocialLink } from "./HarlyLayout";

export type CandidateRejectedProps = {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  companyLogoUrl?: string;
  accentColor?: string;
  socialLinks?: SocialLink[];
  customMessage?: string;
};

export function candidateRejectedSubject({
  companyName,
  jobTitle,
}: Pick<CandidateRejectedProps, "companyName" | "jobTitle">) {
  return `Your application for ${jobTitle} at ${companyName}`;
}

export function CandidateRejected({
  candidateName,
  jobTitle,
  companyName,
  companyLogoUrl,
  accentColor,
  socialLinks,
  customMessage,
}: CandidateRejectedProps) {
  return (
    <WorkspaceLayout
      preview={`An update on your application for ${jobTitle} at ${companyName}.`}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      accentColor={accentColor}
      socialLinks={socialLinks}
    >
      <Text style={heading}>Update on your application</Text>
      <Text style={text}>Hi {candidateName},</Text>
      <Text style={text}>
        {customMessage ??
          `Thank you for applying to ${jobTitle} at ${companyName}. We've decided to move forward with other candidates.`}
      </Text>
      <Text style={{ ...text, color: "#78716c" }}>
        Thanks,
        <br />
        {companyName}
      </Text>
    </WorkspaceLayout>
  );
}

CandidateRejected.PreviewProps = {
  candidateName: "Ava Thompson",
  jobTitle: "Senior Frontend Engineer",
  companyName: "Acme Inc.",
} satisfies CandidateRejectedProps;
