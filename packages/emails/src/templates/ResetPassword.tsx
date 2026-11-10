import { Button, Text } from "@react-email/components";

import { emailTranslator } from "../i18n";
import { HarlyLayout } from "./HarlyLayout";
import { EmailFallbackLink } from "./EmailFallbackLink";

export type ResetPasswordEmailProps = {
  userName: string;
  locale?: string | null;
  resetUrl: string;
};

export const resetPasswordSubject = "Reset your password";

export function getResetPasswordSubject(locale?: string | null) {
  return emailTranslator(locale)("reset.subject");
}

export function ResetPasswordEmail({ resetUrl, locale }: ResetPasswordEmailProps) {
  const t = emailTranslator(locale);
  return (
    <HarlyLayout
      preview={t("reset.preview")}
      locale={locale}
      bodyClassName="mobile:px-6! px-10 pt-8 pb-8"
    >
      <Text className="text-[40px] leading-[1.05] tracking-[-1px] font-inter text-fg m-0 font-medium">
        {t("reset.heading")}
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mt-[18px] mb-9">
        {t("reset.body")}
      </Text>
      <Button
        href={resetUrl}
        className="bg-brand text-[14px] leading-[1.5] font-inter text-fg-inverted inline-block border-none px-4 py-2.5 text-center box-border no-underline"
      >
        {t("reset.button")}
      </Button>
      <EmailFallbackLink url={resetUrl} locale={locale} />
      <Text className="text-[11px] leading-[1.5] tracking-[-0.033px] font-inter text-fg-3 m-0 mt-8 max-w-[310px]">
        {t("reset.notice")}
      </Text>
    </HarlyLayout>
  );
}

ResetPasswordEmail.PreviewProps = {
  userName: "Ava",
  resetUrl: "https://app.harly.dev/reset-password?token=abc123",
} satisfies ResetPasswordEmailProps;
