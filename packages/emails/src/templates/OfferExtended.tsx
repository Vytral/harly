import { Button, Section, Text } from "@react-email/components";

import { emailTranslator } from "../i18n";
import { WorkspaceLayout } from "./WorkspaceLayout";
import { DetailTable } from "./DetailTable";
import { EmailFallbackLink } from "./EmailFallbackLink";
import type { SocialLink } from "./HarlyLayout";

export type OfferExtendedProps = {
  candidateName: string;
  locale?: string | null;
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
  locale,
}: Pick<OfferExtendedProps, "companyName" | "jobTitle" | "locale">) {
  return emailTranslator(locale)("offer.subject", { company: companyName, job: jobTitle });
}

export function OfferExtended({
  candidateName,
  locale,
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
  const t = emailTranslator(locale);
  const rows = [
    { label: t("offer.role"), value: jobTitle },
    ...(salary ? [{ label: t("offer.compensation"), value: salary }] : []),
    ...(equity ? [{ label: t("offer.equity"), value: equity }] : []),
    ...(startDate ? [{ label: t("offer.start"), value: startDate }] : []),
    ...(expiresAt ? [{ label: t("offer.expires"), value: expiresAt }] : []),
  ];

  return (
    <WorkspaceLayout
      preview={t("offer.preview", { company: companyName })}
      locale={locale}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      accentColor={accentColor}
      socialLinks={socialLinks}
      hideBranding={hideBranding}
    >
      <Text className="text-[40px] leading-[1.05] tracking-[-1px] font-inter text-fg m-0 mb-3.5 font-medium">
        {t("offer.heading")}
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">{t("common.greeting", { name: candidateName })}</Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        {t.rich("offer.body", { company: companyName, job: jobTitle, strong: (chunks) => <span className="text-fg font-semibold">{chunks}</span> })}
      </Text>
      <DetailTable rows={rows} />
      <Section className="mt-3">
        <Button
          href={offerUrl}
          className="bg-brand text-[14px] leading-[1.5] font-inter text-fg-inverted inline-block border-none px-4 py-2.5 text-center box-border no-underline"
        >
          {t("offer.button")}
        </Button>
        <EmailFallbackLink url={offerUrl} locale={locale} />
      </Section>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        {t("offer.outro")}
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
