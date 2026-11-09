import { Button, Hr, Section, Text } from "@react-email/components";

import { emailTranslator } from "../i18n";
import { HarlyLayout } from "./HarlyLayout";
import { EmailFallbackLink } from "./EmailFallbackLink";

export type VerifyEmailProps = {
  userName: string;
  locale?: string | null;
  verifyUrl: string;
};

export const verifyEmailSubject = "Verify your email";

export function getVerifyEmailSubject(locale?: string | null) {
  return emailTranslator(locale)("verify.subject");
}

export function VerifyEmail({ userName, verifyUrl, locale }: VerifyEmailProps) {
  const t = emailTranslator(locale);
  return (
    <HarlyLayout preview={t("verify.preview")} locale={locale}>
      <Text className="text-[40px] leading-[1.05] tracking-[-1px] font-inter text-fg m-0 mb-3.5 font-medium">
        {t("verify.heading")}
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        {t("verify.greeting", { name: userName })}
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        {t("verify.body")}
      </Text>
      <Section className="mt-3">
        <Button
          href={verifyUrl}
          className="bg-brand text-[14px] leading-[1.5] font-inter text-fg-inverted inline-block border-none px-4 py-2.5 text-center box-border no-underline"
        >
          {t("verify.button")}
        </Button>
        <EmailFallbackLink url={verifyUrl} locale={locale} />
      </Section>
      <Hr className="border-stroke border-t my-7" />
      <Text className="text-[13px] leading-[1.5] tracking-[-0.039px] font-inter text-fg-3 m-0">
        {t("verify.notice")}
      </Text>
    </HarlyLayout>
  );
}

VerifyEmail.PreviewProps = {
  userName: "Ava",
  verifyUrl: "https://app.harly.dev/verify?token=abc123",
} satisfies VerifyEmailProps;
