import { Button, Section, Text } from "@react-email/components";

import { WorkspaceLayout } from "./WorkspaceLayout";
import { EmailFallbackLink } from "./EmailFallbackLink";
import type { SocialLink } from "./HarlyLayout";

export type ApplicationReceivedCandidateProps = {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  companyLogoUrl?: string;
  accentColor?: string;
  socialLinks?: SocialLink[];
  hideBranding?: boolean;
  jobBoardUrl?: string;
};

export function applicationReceivedCandidateSubject({
  jobTitle,
  companyName,
}: Pick<ApplicationReceivedCandidateProps, "jobTitle" | "companyName">) {
  return `Got your application — ${jobTitle} at ${companyName}`;
}

export function ApplicationReceivedCandidate({
  candidateName,
  jobTitle,
  companyName,
  companyLogoUrl,
  accentColor,
  socialLinks,
  hideBranding,
  jobBoardUrl,
}: ApplicationReceivedCandidateProps) {
  return (
    <WorkspaceLayout
      preview={`Your application for ${jobTitle} is in. We'll be in touch.`}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      accentColor={accentColor}
      socialLinks={socialLinks}
      hideBranding={hideBranding}
    >
      <Text className="text-[40px] leading-[1.05] tracking-[-1px] font-inter text-fg m-0 mb-3.5 font-medium">
        Application received
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">Hi {candidateName},</Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        We got your application for{" "}
        <span className="text-fg font-semibold">{jobTitle}</span>. The team will
        review it carefully and reach out if there&apos;s a fit.
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        Thanks for taking the time — we appreciate it.
      </Text>
      {jobBoardUrl ? (
        <Section className="mt-2">
          <Button
            href={jobBoardUrl}
            className="bg-brand text-[14px] leading-[1.5] font-inter text-fg-inverted inline-block border-none px-4 py-2.5 text-center box-border no-underline"
          >
            See other open roles
          </Button>
          <EmailFallbackLink url={jobBoardUrl} />
        </Section>
      ) : null}
    </WorkspaceLayout>
  );
}

ApplicationReceivedCandidate.PreviewProps = {
  candidateName: "Ava Thompson",
  jobTitle: "Senior Frontend Engineer",
  companyName: "Acme Inc.",
  jobBoardUrl: "https://acme.com/careers",
} satisfies ApplicationReceivedCandidateProps;
