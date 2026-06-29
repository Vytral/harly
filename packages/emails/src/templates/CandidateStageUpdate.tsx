import { Text } from "@react-email/components";

import { heading, text } from "./styles";
import { WorkspaceLayout } from "./WorkspaceLayout";
import type { SocialLink } from "./HarlyLayout";

export type CandidateStageUpdateProps = {
  candidateName: string;
  jobTitle: string;
  stageName: string;
  companyName: string;
  companyLogoUrl?: string;
  accentColor?: string;
  socialLinks?: SocialLink[];
  nextStepMessage?: string;
};

export function candidateStageUpdateSubject({
  jobTitle,
  stageName,
}: Pick<CandidateStageUpdateProps, "jobTitle" | "stageName">) {
  return `You're moving to ${stageName} — ${jobTitle}`;
}

export function CandidateStageUpdate({
  candidateName,
  jobTitle,
  stageName,
  companyName,
  companyLogoUrl,
  accentColor,
  socialLinks,
  nextStepMessage,
}: CandidateStageUpdateProps) {
  return (
    <WorkspaceLayout
      preview={`Good news — your ${jobTitle} application has moved to ${stageName}.`}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      accentColor={accentColor}
      socialLinks={socialLinks}
    >
      <Text style={heading}>You&apos;re moving forward</Text>
      <Text style={text}>Hi {candidateName},</Text>
      <Text style={text}>
        Your application for <strong>{jobTitle}</strong> at {companyName} has
        moved to the <strong>{stageName}</strong> stage.
      </Text>
      {nextStepMessage ? (
        <Text style={text}>{nextStepMessage}</Text>
      ) : (
        <Text style={text}>
          Someone from the team will reach out shortly with next steps.
        </Text>
      )}
    </WorkspaceLayout>
  );
}

CandidateStageUpdate.PreviewProps = {
  candidateName: "Ava Thompson",
  jobTitle: "Senior Frontend Engineer",
  stageName: "Interview",
  companyName: "Acme Inc.",
} satisfies CandidateStageUpdateProps;
