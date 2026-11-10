import { Text } from "@react-email/components";

import { emailTranslator } from "../i18n";
import { WorkspaceLayout } from "./WorkspaceLayout";
import type { SocialLink } from "./HarlyLayout";

export type OfferWithdrawnProps = {
  candidateName: string;
  locale?: string | null;
  companyName: string;
  companyLogoUrl?: string;
  accentColor?: string;
  socialLinks?: SocialLink[];
  hideBranding?: boolean;
  jobTitle: string;
  reason?: string;
};

export function offerWithdrawnSubject({
  companyName,
  jobTitle,
  locale,
}: Pick<OfferWithdrawnProps, "companyName" | "jobTitle" | "locale">) {
  return emailTranslator(locale)("offerWithdrawn.subject", { company: companyName, job: jobTitle });
}

export function OfferWithdrawn({
  candidateName,
  locale,
  companyName,
  companyLogoUrl,
  accentColor,
  socialLinks,
  hideBranding,
  jobTitle,
  reason,
}: OfferWithdrawnProps) {
  const t = emailTranslator(locale);
  return (
    <WorkspaceLayout
      preview={t("offerWithdrawn.preview", { job: jobTitle, company: companyName })}
      locale={locale}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      accentColor={accentColor}
      socialLinks={socialLinks}
      hideBranding={hideBranding}
    >
      <Text className="text-[40px] leading-[1.05] tracking-[-1px] font-inter text-fg m-0 mb-3.5 font-medium">
        {t("offerWithdrawn.heading")}
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">{t("common.greeting", { name: candidateName })}</Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        {reason ?? t("offerWithdrawn.body", { job: jobTitle, company: companyName })}
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        {t("offerWithdrawn.questions")}
      </Text>
    </WorkspaceLayout>
  );
}

OfferWithdrawn.PreviewProps = {
  candidateName: "Ava Thompson",
  companyName: "Acme Inc.",
  jobTitle: "Senior Frontend Engineer",
} satisfies OfferWithdrawnProps;
