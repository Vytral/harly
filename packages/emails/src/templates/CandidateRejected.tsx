import { Text } from "@react-email/components";

import { heading, text } from "./styles";
import { WorkspaceLayout } from "./WorkspaceLayout";

export type CandidateRejectedProps = {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  companyLogoUrl?: string;
  accentColor?: string;
  customMessage?: string;
};

export function candidateRejectedSubject({
  jobTitle,
}: Pick<CandidateRejectedProps, "jobTitle">) {
  return `Your application for ${jobTitle}`;
}

export function CandidateRejected({
  candidateName,
  jobTitle,
  companyName,
  companyLogoUrl,
  accentColor,
  customMessage,
}: CandidateRejectedProps) {
  return (
    <WorkspaceLayout
      preview={`An update on your application for ${jobTitle} at ${companyName}.`}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      accentColor={accentColor}
    >
      <Text style={heading}>Application update</Text>
      <Text style={text}>Hi {candidateName},</Text>
      <Text style={text}>
        Thank you for your interest in <strong>{jobTitle}</strong> at{" "}
        {companyName}.
      </Text>
      <Text style={text}>
        {customMessage ??
          "After careful consideration, we will not be moving forward with your application at this time."}
      </Text>
      <Text style={text}>
        We appreciate the time you invested and wish you the best in your
        search.
      </Text>
    </WorkspaceLayout>
  );
}
