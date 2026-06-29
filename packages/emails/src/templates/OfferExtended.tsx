import { Text } from "@react-email/components";

import { heading, text } from "./styles";
import { WorkspaceLayout } from "./WorkspaceLayout";
import { DetailTable } from "./DetailTable";
import type { SocialLink } from "./HarlyLayout";

export type OfferExtendedProps = {
  candidateName: string;
  companyName: string;
  companyLogoUrl?: string;
  accentColor?: string;
  socialLinks?: SocialLink[];
  jobTitle: string;
  salary?: string;
  startDate?: string;
  expiresAt?: string;
  equity?: string;
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
  jobTitle,
  salary,
  startDate,
  expiresAt,
  equity,
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
    >
      <Text style={heading}>You have an offer</Text>
      <Text style={text}>Hi {candidateName},</Text>
      <Text style={text}>
        We&apos;d love to have you join {companyName} as{" "}
        <strong>{jobTitle}</strong>. Here&apos;s what we&apos;re offering:
      </Text>
      <DetailTable rows={rows} />
      <Text style={text}>
        Reply to this email to accept or to ask any questions. We&apos;re
        excited about the possibility of working with you.
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
} satisfies OfferExtendedProps;
