import { Button, Link, Section, Text } from "@react-email/components";

import { HarlyLayout, type WorkspaceEmailBranding } from "./HarlyLayout";
import { EmailFallbackLink } from "./EmailFallbackLink";

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
      <Text className="text-[40px] leading-[1.05] tracking-[-1px] font-inter text-fg m-0 mb-3.5 font-medium">
        New application
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        <span className="text-fg font-semibold">{candidateName}</span> applied for{" "}
        <span className="text-fg font-semibold">{jobTitle}</span>.
      </Text>
      <Text className="text-[13px] leading-[1.5] tracking-[-0.039px] font-inter text-fg-3 m-0 mb-4">
        <Link href={`mailto:${candidateEmail}`} className="text-fg-3 no-underline">
          {candidateEmail}
        </Link>
      </Text>
      <Section className="mt-3">
        <Button
          href={dashboardUrl}
          className="bg-brand text-[14px] leading-[1.5] font-inter text-fg-inverted inline-block border-none px-4 py-2.5 text-center box-border no-underline"
        >
          Review application
        </Button>
        <EmailFallbackLink url={dashboardUrl} />
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
