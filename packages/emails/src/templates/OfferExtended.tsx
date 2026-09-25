import { Button, Section, Text } from "@react-email/components";

import { WorkspaceLayout } from "./WorkspaceLayout";
import { DetailTable } from "./DetailTable";
import { EmailFallbackLink } from "./EmailFallbackLink";
import type { SocialLink } from "./HarlyLayout";

export type OfferExtendedProps = {
  candidateName: string;
  companyName: string;
  companyLogoUrl?: string;
  accentColor?: string;
  socialLinks?: SocialLink[];
  hideBranding?: boolean;
  jobTitle: string;
  salary?: string;
  startDate?: string;
  expiresAt?: string;
  equity?: string;
  offerUrl: string;
};

export function offerExtendedSubject({
  companyName,
  jobTitle,
}: Pick<OfferExtendedProps, "companyName" | "jobTitle">) {
  return `Offer from ${companyName} — ${jobTitle}`;
}

export function OfferExtended({
  candidateName,
  companyName,
  companyLogoUrl,
  accentColor,
  socialLinks,
  hideBranding,
  jobTitle,
  salary,
  startDate,
  expiresAt,
  equity,
  offerUrl,
}: OfferExtendedProps) {
  const rows = [
    { label: "Role", value: jobTitle },
    ...(salary ? [{ label: "Compensation", value: salary }] : []),
    ...(equity ? [{ label: "Equity", value: equity }] : []),
    ...(startDate ? [{ label: "Start date", value: startDate }] : []),
    ...(expiresAt ? [{ label: "Respond by", value: expiresAt }] : []),
  ];

  return (
    <WorkspaceLayout
      preview={`${companyName} wants you on the team. Here's your offer.`}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      accentColor={accentColor}
      socialLinks={socialLinks}
      hideBranding={hideBranding}
    >
      <Text className="text-[40px] leading-[1.05] tracking-[-1px] font-inter text-fg m-0 mb-3.5 font-medium">
        You have an offer
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">Hi {candidateName},</Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        We&apos;d love to have you join {companyName} as{" "}
        <span className="text-fg font-semibold">{jobTitle}</span>. Here&apos;s what we&apos;re offering:
      </Text>
      <DetailTable rows={rows} />
      <Section className="mt-3">
        <Button
          href={offerUrl}
          className="bg-brand text-[14px] leading-[1.5] font-inter text-fg-inverted inline-block border-none px-4 py-2.5 text-center box-border no-underline"
        >
          Review offer
        </Button>
        <EmailFallbackLink url={offerUrl} />
      </Section>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        Review the offer using the link above, or reply to this email with any questions.
        We&apos;re excited to hear from you.
      </Text>
    </WorkspaceLayout>
  );
}

OfferExtended.PreviewProps = {
  candidateName: "Ava Thompson",
  companyName: "Acme Inc.",
  jobTitle: "Senior Frontend Engineer",
  salary: "$140,000 / year",
  startDate: "August 1, 2026",
  expiresAt: "July 10, 2026",
  equity: "0.15% over 4 years",
  offerUrl: "https://app.harly.dev/portal/applications/application-123",
} satisfies OfferExtendedProps;
