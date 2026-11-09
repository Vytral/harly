import { Text } from "@react-email/components";

import { emailTranslator } from "../i18n";
import { WorkspaceLayout } from "./WorkspaceLayout";
import type { SocialLink } from "./HarlyLayout";

export type InterviewCanceledProps = {
  candidateName: string;
  locale?: string | null;
  companyName: string;
  companyLogoUrl?: string;
  accentColor?: string;
  socialLinks?: SocialLink[];
  hideBranding?: boolean;
  jobTitle: string;
  interviewType: string;
  when?: string;
  reason?: string;
};

export function interviewCanceledSubject({
  companyName,
  jobTitle,
  locale,
}: Pick<InterviewCanceledProps, "companyName" | "jobTitle" | "locale">) {
  return emailTranslator(locale)("interviewCanceled.subject", { company: companyName, job: jobTitle });
}

export function InterviewCanceled({
  candidateName,
  locale,
  companyName,
  companyLogoUrl,
  accentColor,
  socialLinks,
  hideBranding,
  jobTitle,
  interviewType,
  when,
  reason,
}: InterviewCanceledProps) {
  const t = emailTranslator(locale);
  const strong = (chunks: React.ReactNode) => <span className="text-fg font-semibold">{chunks}</span>;
  return (
    <WorkspaceLayout
      preview={t("interviewCanceled.preview", { type: interviewType.toLowerCase(), job: jobTitle })}
      locale={locale}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      accentColor={accentColor}
      socialLinks={socialLinks}
      hideBranding={hideBranding}
    >
      <Text className="text-[40px] leading-[1.05] tracking-[-1px] font-inter text-fg m-0 mb-3.5 font-medium">
        {t("interviewCanceled.heading")}
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">{t("common.greeting", { name: candidateName })}</Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        {when
          ? t.rich("interviewCanceled.bodyWithTime", { type: interviewType.toLowerCase(), job: jobTitle, when, strong })
          : t.rich("interviewCanceled.body", { type: interviewType.toLowerCase(), job: jobTitle, strong })}
      </Text>
      {reason ? (
        <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">{reason}</Text>
      ) : null}
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        {t("interviewCanceled.reschedule")}
      </Text>
    </WorkspaceLayout>
  );
}

InterviewCanceled.PreviewProps = {
  candidateName: "Ava Thompson",
  companyName: "Acme Inc.",
  jobTitle: "Senior Frontend Engineer",
  interviewType: "Technical interview",
  when: "Thursday, July 3 at 2:00 PM",
} satisfies InterviewCanceledProps;
