import { Text } from "@react-email/components";

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
      <Text className="text-[32px] leading-[1.2] tracking-[-0.6px] font-inter text-fg m-0 mb-3.5 font-bold">
        Offer update
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">Hi {candidateName},</Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        {reason ??
          `The offer for ${jobTitle} at ${companyName} has been withdrawn.`}
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
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
