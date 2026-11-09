import { Button, Section, Text } from "@react-email/components";

import { emailTranslator } from "../i18n";
import { HarlyLayout, type WorkspaceEmailBranding } from "./HarlyLayout";
import { EmailFallbackLink } from "./EmailFallbackLink";

export type WelcomeEmailProps = {
  userName: string;
  locale?: string | null;
  workspaceName?: string;
  dashboardUrl: string;
  branding?: WorkspaceEmailBranding;
};

export const welcomeEmailSubject = "Welcome to Harly";

export function getWelcomeEmailSubject(locale?: string | null) {
  return emailTranslator(locale)("welcome.subject");
}

export function WelcomeEmail({
  userName,
  locale,
  workspaceName,
  dashboardUrl,
  branding,
}: WelcomeEmailProps) {
  const t = emailTranslator(locale);
  const displayName = workspaceName || branding?.name || "Harly";

  return (
    <HarlyLayout
      preview={t("welcome.preview", { workspace: displayName, name: userName })}
      locale={locale}
      branding={branding}
    >
      <Text className="text-[40px] leading-[1.05] tracking-[-1px] font-inter text-fg m-0 mb-3.5 font-medium">
        {t("welcome.heading", { name: userName })}
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        {t("welcome.body", { workspace: displayName })}
      </Text>
      <Section className="mt-3">
        <Button
          href={dashboardUrl}
          className="bg-brand text-[14px] leading-[1.5] font-inter text-fg-inverted inline-block border-none px-4 py-2.5 text-center box-border no-underline"
        >
          {t("welcome.button")}
        </Button>
        <EmailFallbackLink url={dashboardUrl} locale={locale} />
      </Section>
    </HarlyLayout>
  );
}

WelcomeEmail.PreviewProps = {
  userName: "Ava",
  workspaceName: "Acme Inc.",
  dashboardUrl: "https://app.harly.dev/dashboard",
} satisfies WelcomeEmailProps;
