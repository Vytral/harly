import { Button, Section, Text } from "@react-email/components";

import { emailTranslator } from "../i18n";
import { WorkspaceLayout } from "./WorkspaceLayout";
import type { SocialLink } from "./HarlyLayout";
import { EmailFallbackLink } from "./EmailFallbackLink";

export type CandidateStageUpdateProps = {
  candidateName: string;
  locale?: string | null;
  jobTitle: string;
  stageName: string;
  companyName: string;
  companyLogoUrl?: string;
  accentColor?: string;
  socialLinks?: SocialLink[];
  hideBranding?: boolean;
  nextStepMessage?: string;
  portalUrl?: string;
};

export function candidateStageUpdateSubject({
  jobTitle,
  stageName,
  locale,
}: Pick<CandidateStageUpdateProps, "jobTitle" | "stageName" | "locale">) {
  return emailTranslator(locale)("stageUpdate.subject", { job: jobTitle, stage: stageName });
}

export function CandidateStageUpdate({
  candidateName,
  locale,
  jobTitle,
  stageName,
  companyName,
  companyLogoUrl,
  accentColor,
  socialLinks,
  hideBranding,
  nextStepMessage,
  portalUrl,
}: CandidateStageUpdateProps) {
  const t = emailTranslator(locale);
  return (
    <WorkspaceLayout
      preview={t("stageUpdate.preview", { job: jobTitle, stage: stageName })}
      locale={locale}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      accentColor={accentColor}
      socialLinks={socialLinks}
      hideBranding={hideBranding}
    >
      <Text className="text-[40px] leading-[1.05] tracking-[-1px] font-inter text-fg m-0 mb-3.5 font-medium">
        {t("stageUpdate.heading")}
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        {t("common.greeting", { name: candidateName })}
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        {t.rich("stageUpdate.body", { job: jobTitle, company: companyName, stage: stageName, strong: (chunks) => <span className="text-fg font-semibold">{chunks}</span> })}
      </Text>
      {nextStepMessage ? (
        <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
          {nextStepMessage}
        </Text>
      ) : (
        <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
          {t("stageUpdate.next")}
        </Text>
      )}
      {portalUrl ? (
        <Section className="mt-2">
          <Button
            href={portalUrl}
            className="bg-brand text-[14px] leading-[1.5] font-inter text-fg-inverted inline-block border-none px-4 py-2.5 text-center box-border no-underline"
          >
            {t("stageUpdate.button")}
          </Button>
          <EmailFallbackLink url={portalUrl} locale={locale} />
        </Section>
      ) : null}
    </WorkspaceLayout>
  );
}

CandidateStageUpdate.PreviewProps = {
  candidateName: "Ava Thompson",
  jobTitle: "Senior Frontend Engineer",
  stageName: "Interview",
  companyName: "Acme Inc.",
} satisfies CandidateStageUpdateProps;
