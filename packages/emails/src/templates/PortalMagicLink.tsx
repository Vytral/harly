import { Button, Hr, Section, Text } from "@react-email/components";

import { emailTranslator } from "../i18n";
import { HarlyLayout } from "./HarlyLayout";
import { EmailFallbackLink } from "./EmailFallbackLink";

export type PortalMagicLinkEmailProps = {
  candidateName?: string;
  loginUrl: string;
  locale?: string | null;
};

export function portalMagicLinkSubject(locale?: string | null) {
  return emailTranslator(locale)("portalMagic.subject");
}

export function PortalMagicLinkEmail({ candidateName, loginUrl, locale }: PortalMagicLinkEmailProps) {
  const t = emailTranslator(locale);
  return (
    <HarlyLayout preview={t("portalMagic.preview")} locale={locale}>
      <Text className="text-[40px] leading-[1.05] tracking-[-1px] font-inter text-fg m-0 mb-3.5 font-medium">
        {t("portalMagic.heading")}
      </Text>
      {candidateName ? (
        <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">{t("common.greeting", { name: candidateName })}</Text>
      ) : null}
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        {t("portalMagic.body")}
      </Text>
      <Section className="mt-3">
        <Button
          href={loginUrl}
          className="bg-brand text-[14px] leading-[1.5] font-inter text-fg-inverted inline-block border-none px-4 py-2.5 text-center box-border no-underline"
        >
          {t("common.signIn")}
        </Button>
        <EmailFallbackLink url={loginUrl} locale={locale} />
      </Section>
      <Hr className="border-stroke border-t my-7" />
      <Text className="text-[13px] leading-[1.5] tracking-[-0.039px] font-inter text-fg-3 m-0">
        {t("common.ignore")}
      </Text>
    </HarlyLayout>
  );
}

PortalMagicLinkEmail.PreviewProps = {
  candidateName: "Ava",
  loginUrl: "https://app.harly.dev/portal/login?token=abc123",
} satisfies PortalMagicLinkEmailProps;
