import { Button, Hr, Section, Text } from "@react-email/components";

import { emailTranslator } from "../i18n";
import { WorkspaceLayout } from "./WorkspaceLayout";
import type { SocialLink } from "./HarlyLayout";
import { EmailFallbackLink } from "./EmailFallbackLink";

export type CandidateRejectedProps = {
  candidateName: string;
  locale?: string | null;
  jobTitle: string;
  companyName: string;
  companyLogoUrl?: string;
  accentColor?: string;
  socialLinks?: SocialLink[];
  hideBranding?: boolean;
  customMessage?: string;
  portalUrl?: string;
};

export function candidateRejectedSubject({
  companyName,
  jobTitle,
  locale,
}: Pick<CandidateRejectedProps, "companyName" | "jobTitle" | "locale">) {
  return emailTranslator(locale)("rejection.subject", { company: companyName, job: jobTitle });
}

export function CandidateRejected({
  candidateName,
  locale,
  jobTitle,
  companyName,
  companyLogoUrl,
  accentColor,
  socialLinks,
  hideBranding,
  customMessage,
  portalUrl,
}: CandidateRejectedProps) {
  const t = emailTranslator(locale);
  return (
    <WorkspaceLayout
      preview={t("rejection.preview", { job: jobTitle, company: companyName })}
      locale={locale}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      accentColor={accentColor}
      socialLinks={socialLinks}
      hideBranding={hideBranding}
    >
      <Text className="text-[40px] leading-[1.05] tracking-[-1px] font-inter text-fg m-0 mb-3.5 font-medium">
        {t("rejection.heading")}
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        {t("common.greeting", { name: candidateName })}
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        {customMessage ?? t("rejection.body", { job: jobTitle, company: companyName })}
      </Text>
      <Hr className="border-stroke border-t my-7" />
      <Text className="text-[13px] leading-[1.5] tracking-[-0.039px] font-inter text-fg-3 m-0">
        {t("rejection.signoff")}
        <br />
        {companyName}
      </Text>
      {portalUrl ? (
        <Section className="mt-2">
          <Button
            href={portalUrl}
            className="border border-stroke text-[14px] leading-[1.5] font-inter text-fg inline-block px-4 py-2.5 text-center box-border no-underline"
          >
            {t("rejection.button")}
          </Button>
          <EmailFallbackLink url={portalUrl} locale={locale} />
        </Section>
      ) : null}
    </WorkspaceLayout>
  );
}

CandidateRejected.PreviewProps = {
  candidateName: "Ava Thompson",
  jobTitle: "Senior Frontend Engineer",
  companyName: "Acme Inc.",
} satisfies CandidateRejectedProps;
