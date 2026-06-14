import { Text } from "@react-email/components";

import { heading, text } from "./styles";
import { WorkspaceLayout } from "./WorkspaceLayout";

export type CandidateStageUpdateProps = {
  candidateName: string;
  jobTitle: string;
  stageName: string;
  companyName: string;
  companyLogoUrl?: string;
  accentColor?: string;
};

export function candidateStageUpdateSubject({
  jobTitle,
}: Pick<CandidateStageUpdateProps, "jobTitle">) {
  return `Update on your application — ${jobTitle}`;
}

export function CandidateStageUpdate({
  candidateName,
  jobTitle,
  stageName,
  companyName,
  companyLogoUrl,
  accentColor,
}: CandidateStageUpdateProps) {
  return (
    <WorkspaceLayout
      preview={`Your application for ${jobTitle} at ${companyName} has moved to: ${stageName}.`}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      accentColor={accentColor}
    >
      <Text style={heading}>Application update</Text>
      <Text style={text}>Hi {candidateName},</Text>
      <Text style={text}>
        Your application for <strong>{jobTitle}</strong> at {companyName} has
        moved to a new stage: <strong>{stageName}</strong>.
      </Text>
      <Text style={text}>
        The hiring team will reach out if they need anything else from you.
      </Text>
    </WorkspaceLayout>
  );
}
