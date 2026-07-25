import { Button, Section, Text } from "@react-email/components";

import { WorkspaceLayout } from "./WorkspaceLayout";
import type { SocialLink } from "./HarlyLayout";
import { EmailFallbackLink } from "./EmailFallbackLink";

export type CandidateStageUpdateProps = {
  candidateName: string;
  jobTitle: string;
  stageName: string;
  companyName: string;
  companyLogoUrl?: string;
  accentColor?: string;
  socialLinks?: SocialLink[];
  hideBranding?: boolean;
  nextStepMessage?: string;
  portalUrl?: string;
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
  hideBranding,
  nextStepMessage,
  portalUrl,
}: CandidateStageUpdateProps) {
  return (
    <WorkspaceLayout
      preview={`Good news — your ${jobTitle} application has moved to ${stageName}.`}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      accentColor={accentColor}
      socialLinks={socialLinks}
      hideBranding={hideBranding}
    >
      <Text className="text-[40px] leading-[1.05] tracking-[-1px] font-inter text-fg m-0 mb-3.5 font-medium">
        You&apos;re moving forward
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        Hi {candidateName},
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        Your application for{" "}
        <span className="text-fg font-semibold">{jobTitle}</span> at{" "}
        {companyName} has moved to the{" "}
        <span className="text-fg font-semibold">{stageName}</span> stage.
      </Text>
      {nextStepMessage ? (
        <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
          {nextStepMessage}
        </Text>
      ) : (
        <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
          Someone from the team will reach out shortly with next steps.
        </Text>
      )}
      {portalUrl ? (
        <Section className="mt-2">
          <Button
            href={portalUrl}
            className="bg-brand text-[14px] leading-[1.5] font-inter text-fg-inverted inline-block border-none px-4 py-2.5 text-center box-border no-underline"
          >
            View application status
          </Button>
          <EmailFallbackLink url={portalUrl} />
        </Section>
      ) : null}
    </WorkspaceLayout>
  );
}

CandidateStageUpdate.PreviewProps = {
  candidateName: "Ava Thompson",
  jobTitle: "Senior Frontend Engineer",
  stageName: "Interview",
  companyName: "Acme Inc.",
} satisfies CandidateStageUpdateProps;
