import { Button, Section, Text } from "@react-email/components";

import { WorkspaceLayout } from "./WorkspaceLayout";
import { DetailTable } from "./DetailTable";
import { EmailFallbackLink } from "./EmailFallbackLink";
import type { SocialLink } from "./HarlyLayout";

export type SignatureInvitationProps = {
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
  companyName,
  documentName,
  reminder,
}: Pick<SignatureInvitationProps, "companyName" | "documentName" | "reminder">) {
  return `${reminder ? "Reminder: " : ""}${companyName} asked you to sign ${documentName}`;
}

export function SignatureInvitation({
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
  const rows = [
    { label: "Document", value: documentName },
    { label: "Requested by", value: requestedBy ? `${requestedBy}, ${companyName}` : companyName },
    ...(signerPosition && signerPosition.total > 1
      ? [{ label: "Your turn", value: `Signer ${signerPosition.order} of ${signerPosition.total}` }]
      : []),
    { label: "Link works until", value: expiresOn },
  ];
  return (
    <WorkspaceLayout
      preview={`${companyName} is waiting for your signature on ${documentName}.`}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      accentColor={accentColor}
      socialLinks={socialLinks}
      hideBranding={hideBranding}
    >
      <Text className="text-[40px] leading-[1.05] tracking-[-1px] font-inter text-fg m-0 mb-3.5 font-medium">
        {reminder ? "Still waiting on your signature" : "Please review and sign"}
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">Hi {recipientName},</Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        {reminder
          ? `This is a friendly reminder that ${companyName} is still waiting for your signature.`
          : `${companyName} has asked you to review and sign a document.`}
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
          Review and sign
        </Button>
        <EmailFallbackLink url={signUrl} />
      </Section>
      <Text className="text-[12px] leading-[1.5] font-inter text-fg-3 m-0 mt-4">
        This link is personal to you. Do not forward it. If you were not expecting this request, you can ignore this
        email or reply to ask the sender.
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
