import { Text } from "@react-email/components";

import { heading, text } from "./styles";
import { WorkspaceLayout } from "./WorkspaceLayout";

export type OfferWithdrawnProps = {
  candidateName: string;
  companyName: string;
  companyLogoUrl?: string;
  accentColor?: string;
  jobTitle: string;
};

export function offerWithdrawnSubject({
  companyName,
}: Pick<OfferWithdrawnProps, "companyName">) {
  return `Update on your offer from ${companyName}`;
}

export function OfferWithdrawn({
  candidateName,
  companyName,
  companyLogoUrl,
  accentColor,
  jobTitle,
}: OfferWithdrawnProps) {
  return (
    <WorkspaceLayout
      preview={`An update on your offer for ${jobTitle} at ${companyName}.`}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      accentColor={accentColor}
    >
      <Text style={heading}>Update on your offer</Text>
      <Text style={text}>Hi {candidateName},</Text>
      <Text style={text}>
        We are writing to let you know that the offer for{" "}
        <strong>{jobTitle}</strong> at {companyName} has been withdrawn.
      </Text>
      <Text style={text}>
        We know this is disappointing. If you have questions, reply to this
        email and the hiring team will get back to you.
      </Text>
    </WorkspaceLayout>
  );
}
