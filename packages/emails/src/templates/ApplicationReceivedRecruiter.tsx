import { Button, Link, Section, Text } from "@react-email/components";

import { emailTranslator } from "../i18n";
import { HarlyLayout, type WorkspaceEmailBranding } from "./HarlyLayout";
import { EmailFallbackLink } from "./EmailFallbackLink";

export type ApplicationReceivedRecruiterProps = {
  candidateName: string;
  locale?: string | null;
  candidateEmail: string;
  jobTitle: string;
  dashboardUrl: string;
  branding?: WorkspaceEmailBranding;
};

export function applicationReceivedRecruiterSubject({
  candidateName,
  jobTitle,
  locale,
}: Pick<ApplicationReceivedRecruiterProps, "candidateName" | "jobTitle" | "locale">) {
  return emailTranslator(locale)("applicationRecruiter.subject", { candidate: candidateName, job: jobTitle });
}

export function ApplicationReceivedRecruiter({
  candidateName,
  locale,
  candidateEmail,
  jobTitle,
  dashboardUrl,
  branding,
}: ApplicationReceivedRecruiterProps) {
  const t = emailTranslator(locale);
  return (
    <HarlyLayout
      preview={t("applicationRecruiter.preview", { candidate: candidateName, job: jobTitle })}
      locale={locale}
      branding={branding}
    >
      <Text className="text-[40px] leading-[1.05] tracking-[-1px] font-inter text-fg m-0 mb-3.5 font-medium">
        {t("applicationRecruiter.heading")}
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        {t.rich("applicationRecruiter.body", { candidate: candidateName, job: jobTitle, strong: (chunks) => <span className="text-fg font-semibold">{chunks}</span> })}
      </Text>
      <Text className="text-[13px] leading-[1.5] tracking-[-0.039px] font-inter text-fg-3 m-0 mb-4">
        <Link href={`mailto:${candidateEmail}`} className="text-fg-3 no-underline">
          {candidateEmail}
        </Link>
      </Text>
      <Section className="mt-3">
        <Button
          href={dashboardUrl}
          className="bg-brand text-[14px] leading-[1.5] font-inter text-fg-inverted inline-block border-none px-4 py-2.5 text-center box-border no-underline"
        >
          {t("applicationRecruiter.button")}
        </Button>
        <EmailFallbackLink url={dashboardUrl} locale={locale} />
      </Section>
    </HarlyLayout>
  );
}

ApplicationReceivedRecruiter.PreviewProps = {
  candidateName: "Ava Thompson",
  candidateEmail: "ava@example.com",
  jobTitle: "Senior Frontend Engineer",
  dashboardUrl: "https://app.harly.dev/dashboard/candidates/123",
} satisfies ApplicationReceivedRecruiterProps;
