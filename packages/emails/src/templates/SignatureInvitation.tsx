import { Button, Section, Text } from "@react-email/components";

import { WorkspaceLayout } from "./WorkspaceLayout";
import { DetailTable } from "./DetailTable";
import { EmailFallbackLink } from "./EmailFallbackLink";
import type { SocialLink } from "./HarlyLayout";
import { emailTranslator } from "../i18n";

export type SignatureInvitationProps = {
  /** Language of the recipient. */
  locale?: string | null;
  recipientName: string;
  companyName: string;
  companyLogoUrl?: string;
  accentColor?: string;
  socialLinks?: SocialLink[];
  hideBranding?: boolean;
  documentName: string;
  /** Person who asked for the signature, when known. */
  requestedBy?: string;
  /** Free-text note from the sender. */
  message?: string;
  /** Human readable, e.g. "Friday, 14 November 2026 (UTC)". */
  expiresOn: string;
  signerPosition?: { order: number; total: number };
  signUrl: string;
  /** True for reminder emails: changes the heading and intro only. */
  reminder?: boolean;
  /** Reminder emails say how many have been sent so far. */
  reminderNumber?: number;
};

export function signatureInvitationSubject({
  locale,
  companyName,
  documentName,
  reminder,
}: Pick<SignatureInvitationProps, "companyName" | "documentName" | "reminder" | "locale">) {
  return emailTranslator(locale)(reminder ? "signatureInvitation.reminderSubject" : "signatureInvitation.subject", { company: companyName, document: documentName });
}

export function SignatureInvitation({
  locale,
  recipientName,
  companyName,
  companyLogoUrl,
  accentColor,
  socialLinks,
  hideBranding,
  documentName,
  requestedBy,
  message,
  expiresOn,
  signerPosition,
  signUrl,
  reminder,
}: SignatureInvitationProps) {
  const t = emailTranslator(locale);
  const rows = [
    { label: t("signatureInvitation.document"), value: documentName },
    { label: t("signatureInvitation.requestedBy"), value: requestedBy ? `${requestedBy}, ${companyName}` : companyName },
    ...(signerPosition && signerPosition.total > 1
      ? [{ label: t("signatureInvitation.yourTurn"), value: t("signatureInvitation.signerPosition", { order: signerPosition.order, total: signerPosition.total }) }]
      : []),
    { label: t("signatureInvitation.expires"), value: expiresOn },
  ];
  return (
    <WorkspaceLayout
      preview={t("signatureInvitation.preview", { company: companyName, document: documentName })}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      accentColor={accentColor}
      socialLinks={socialLinks}
      hideBranding={hideBranding}
      locale={locale}
    >
      <Text className="text-[40px] leading-[1.05] tracking-[-1px] font-inter text-fg m-0 mb-3.5 font-medium">
        {t(reminder ? "signatureInvitation.reminderHeading" : "signatureInvitation.heading")}
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">{t("common.greeting", { name: recipientName })}</Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        {reminder
          ? t("signatureInvitation.reminderBody", { company: companyName })
          : t("signatureInvitation.body", { company: companyName })}
      </Text>
      {message ? (
        <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4" style={{ whiteSpace: "pre-wrap" }}>
          &ldquo;{message}&rdquo;
        </Text>
      ) : null}
      <DetailTable rows={rows} />
      <Section className="mt-3">
        <Button
          href={signUrl}
          className="bg-brand text-[14px] leading-[1.5] font-inter text-fg-inverted inline-block border-none px-4 py-2.5 text-center box-border no-underline"
        >
          {t("signatureInvitation.button")}
        </Button>
        <EmailFallbackLink url={signUrl} locale={locale} />
      </Section>
      <Text className="text-[12px] leading-[1.5] font-inter text-fg-3 m-0 mt-4">
        {t("signatureInvitation.notice")}
      </Text>
    </WorkspaceLayout>
  );
}

SignatureInvitation.PreviewProps = {
  recipientName: "Ava Thompson",
  companyName: "Acme Inc.",
  documentName: "Employment agreement.pdf",
  requestedBy: "Sam Rivera",
  expiresOn: "Friday, 14 November 2026 (UTC)",
  signerPosition: { order: 1, total: 2 },
  signUrl: "https://app.example.com/sign/token",
} satisfies SignatureInvitationProps;
