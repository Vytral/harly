import { Button, Hr, Section, Text } from "@react-email/components";

import { WorkspaceLayout } from "./WorkspaceLayout";
import type { SocialLink } from "./HarlyLayout";
import { EmailFallbackLink } from "./EmailFallbackLink";

export type CandidateRejectedProps = {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  companyLogoUrl?: string;
  accentColor?: string;
  socialLinks?: SocialLink[];
  hideBranding?: boolean;
  customMessage?: string;
  portalUrl?: string;
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
  hideBranding,
  customMessage,
  portalUrl,
}: CandidateRejectedProps) {
  return (
    <WorkspaceLayout
      preview={`An update on your application for ${jobTitle} at ${companyName}.`}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      accentColor={accentColor}
      socialLinks={socialLinks}
      hideBranding={hideBranding}
    >
      <Text className="text-[40px] leading-[1.05] tracking-[-1px] font-inter text-fg m-0 mb-3.5 font-medium">
        Update on your application
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        Hi {candidateName},
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        {customMessage ??
          `Thank you for applying to ${jobTitle} at ${companyName}. After careful consideration, we've decided to move forward with other candidates.`}
      </Text>
      <Hr className="border-stroke border-t my-7" />
      <Text className="text-[13px] leading-[1.5] tracking-[-0.039px] font-inter text-fg-3 m-0">
        Thanks,
        <br />
        {companyName}
      </Text>
      {portalUrl ? (
        <Section className="mt-2">
          <Button
            href={portalUrl}
            className="border border-stroke text-[14px] leading-[1.5] font-inter text-fg inline-block px-4 py-2.5 text-center box-border no-underline"
          >
            View application status
          </Button>
          <EmailFallbackLink url={portalUrl} />
        </Section>
      ) : null}
    </WorkspaceLayout>
  );
}

CandidateRejected.PreviewProps = {
  candidateName: "Ava Thompson",
  jobTitle: "Senior Frontend Engineer",
  companyName: "Acme Inc.",
} satisfies CandidateRejectedProps;
