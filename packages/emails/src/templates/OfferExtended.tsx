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
  return `Your offer from ${companyName} — ${jobTitle}`;
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
      preview={`${companyName} has extended you an offer for ${jobTitle}.`}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      accentColor={accentColor}
      socialLinks={socialLinks}
    >
      <Text style={heading}>You have an offer</Text>
      <Text style={text}>Hi {candidateName},</Text>
      <Text style={text}>
        We are delighted to offer you the role of{" "}
        <strong>{jobTitle}</strong> at {companyName}. Here are the details:
      </Text>
      <DetailTable rows={rows} />
      <Text style={text}>
        Reply to this email to accept, or let us know if you have any
        questions.
      </Text>
    </WorkspaceLayout>
  );
}
