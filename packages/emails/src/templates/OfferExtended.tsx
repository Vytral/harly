import { Text } from "@react-email/components";

import { heading, text } from "./styles";
import { WorkspaceLayout } from "./WorkspaceLayout";
import { DetailTable } from "./DetailTable";

export type OfferExtendedProps = {
  candidateName: string;
  companyName: string;
  companyLogoUrl?: string;
  accentColor?: string;
  jobTitle: string;
  /** Pre-formatted compensation line, e.g. "$120,000 / year". Optional. */
  salary?: string;
  /** Pre-formatted start date, e.g. "March 3, 2026". Optional. */
  startDate?: string;
  /** Pre-formatted expiry date for the offer. Optional. */
  expiresAt?: string;
  /** Free-form equity description. Optional. */
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
