import { Text } from "@react-email/components";

import { heading, text } from "./styles";
import { WorkspaceLayout } from "./WorkspaceLayout";
import type { SocialLink } from "./HarlyLayout";

export type OfferWithdrawnProps = {
  candidateName: string;
  companyName: string;
  companyLogoUrl?: string;
  accentColor?: string;
  socialLinks?: SocialLink[];
  jobTitle: string;
  reason?: string;
};

export function offerWithdrawnSubject({
  companyName,
  jobTitle,
}: Pick<OfferWithdrawnProps, "companyName" | "jobTitle">) {
  return `Update on your offer — ${jobTitle} at ${companyName}`;
}

export function OfferWithdrawn({
  candidateName,
  companyName,
  companyLogoUrl,
  accentColor,
  socialLinks,
  jobTitle,
  reason,
}: OfferWithdrawnProps) {
  return (
    <WorkspaceLayout
      preview={`An update on your offer for ${jobTitle} at ${companyName}.`}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      accentColor={accentColor}
      socialLinks={socialLinks}
    >
      <Text style={heading}>Offer update</Text>
      <Text style={text}>Hi {candidateName},</Text>
      <Text style={text}>
        {reason ??
          `The offer for ${jobTitle} at ${companyName} has been withdrawn.`}
      </Text>
      <Text style={text}>
        Questions? Reply to this email and we&apos;ll walk you through what happened.
      </Text>
    </WorkspaceLayout>
  );
}

OfferWithdrawn.PreviewProps = {
  candidateName: "Ava Thompson",
  companyName: "Acme Inc.",
  jobTitle: "Senior Frontend Engineer",
} satisfies OfferWithdrawnProps;
