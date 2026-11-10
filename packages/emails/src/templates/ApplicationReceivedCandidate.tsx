import { Button, Section, Text } from "@react-email/components";

import { emailTranslator } from "../i18n";
import { WorkspaceLayout } from "./WorkspaceLayout";
import { EmailFallbackLink } from "./EmailFallbackLink";
import type { SocialLink } from "./HarlyLayout";

export type ApplicationReceivedCandidateProps = {
  candidateName: string;
  locale?: string | null;
  jobTitle: string;
  companyName: string;
  companyLogoUrl?: string;
  accentColor?: string;
  socialLinks?: SocialLink[];
  hideBranding?: boolean;
  jobBoardUrl?: string;
  portalUrl?: string;
  profileUrl?: string;
};

export function applicationReceivedCandidateSubject({
  jobTitle,
  companyName,
  locale,
}: Pick<ApplicationReceivedCandidateProps, "jobTitle" | "companyName" | "locale">) {
  return emailTranslator(locale)("applicationCandidate.subject", { job: jobTitle, company: companyName });
}

export function ApplicationReceivedCandidate({
  candidateName,
  locale,
  jobTitle,
  companyName,
  companyLogoUrl,
  accentColor,
  socialLinks,
  hideBranding,
  jobBoardUrl,
  portalUrl,
  profileUrl,
}: ApplicationReceivedCandidateProps) {
  const t = emailTranslator(locale);
  return (
    <WorkspaceLayout
      preview={t("applicationCandidate.preview", { job: jobTitle })}
      locale={locale}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      accentColor={accentColor}
      socialLinks={socialLinks}
      hideBranding={hideBranding}
    >
      <Text className="text-[40px] leading-[1.05] tracking-[-1px] font-inter text-fg m-0 mb-3.5 font-medium">
        {t("applicationCandidate.heading")}
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        {t("common.greeting", { name: candidateName })}
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        {t.rich("applicationCandidate.body", { job: jobTitle, strong: (chunks) => <span className="text-fg font-semibold">{chunks}</span> })}
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        {t("applicationCandidate.thanks")}
      </Text>
      {portalUrl ? (
        <Section className="mt-2">
          <Button
            href={portalUrl}
            className="bg-brand text-[14px] leading-[1.5] font-inter text-fg-inverted inline-block border-none px-4 py-2.5 text-center box-border no-underline"
          >
            {t("applicationCandidate.application")}
          </Button>
          <EmailFallbackLink url={portalUrl} locale={locale} />
        </Section>
      ) : null}
      {profileUrl ? (
        <Section className="mt-2">
          <Button
            href={profileUrl}
            className="border border-stroke text-[14px] leading-[1.5] font-inter text-fg inline-block px-4 py-2.5 text-center box-border no-underline"
          >
            {t("applicationCandidate.profile")}
          </Button>
          <EmailFallbackLink url={profileUrl} locale={locale} />
        </Section>
      ) : null}
      {jobBoardUrl ? (
        <Section className="mt-2">
          <Button
            href={jobBoardUrl}
            className="bg-brand text-[14px] leading-[1.5] font-inter text-fg-inverted inline-block border-none px-4 py-2.5 text-center box-border no-underline"
          >
            {t("applicationCandidate.jobs")}
          </Button>
          <EmailFallbackLink url={jobBoardUrl} locale={locale} />
        </Section>
      ) : null}
    </WorkspaceLayout>
  );
}

ApplicationReceivedCandidate.PreviewProps = {
  candidateName: "Ava Thompson",
  jobTitle: "Senior Frontend Engineer",
  companyName: "Acme Inc.",
  jobBoardUrl: "https://acme.com/careers",
} satisfies ApplicationReceivedCandidateProps;
