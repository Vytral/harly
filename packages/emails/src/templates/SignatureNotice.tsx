import { Button, Section, Text } from "@react-email/components";

import { WorkspaceLayout } from "./WorkspaceLayout";
import { DetailTable } from "./DetailTable";
import { EmailFallbackLink } from "./EmailFallbackLink";
import type { SocialLink } from "./HarlyLayout";

export type SignatureNoticeProps = {
  recipientName: string;
  companyName: string;
  companyLogoUrl?: string;
  accentColor?: string;
  socialLinks?: SocialLink[];
  hideBranding?: boolean;
  heading: string;
  /** Paragraphs shown under the greeting. */
  paragraphs: string[];
  rows?: Array<{ label: string; value: string }>;
  cta?: { label: string; url: string };
  footnote?: string;
};

export function SignatureNotice({
  recipientName,
  companyName,
  companyLogoUrl,
  accentColor,
  socialLinks,
  hideBranding,
  heading,
  paragraphs,
  rows,
  cta,
  footnote,
}: SignatureNoticeProps) {
  return (
    <WorkspaceLayout
      preview={heading}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      accentColor={accentColor}
      socialLinks={socialLinks}
      hideBranding={hideBranding}
    >
      <Text className="text-[40px] leading-[1.05] tracking-[-1px] font-inter text-fg m-0 mb-3.5 font-medium">
        {heading}
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">Hi {recipientName},</Text>
      {paragraphs.map((paragraph, index) => (
        <Text key={index} className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4" style={{ whiteSpace: "pre-wrap" }}>
          {paragraph}
        </Text>
      ))}
      {rows && rows.length > 0 ? <DetailTable rows={rows} /> : null}
      {cta ? (
        <Section className="mt-3">
          <Button
            href={cta.url}
            className="bg-brand text-[14px] leading-[1.5] font-inter text-fg-inverted inline-block border-none px-4 py-2.5 text-center box-border no-underline"
          >
            {cta.label}
          </Button>
          <EmailFallbackLink url={cta.url} />
        </Section>
      ) : null}
      {footnote ? (
        <Text className="text-[12px] leading-[1.5] font-inter text-fg-3 m-0 mt-4">{footnote}</Text>
      ) : null}
    </WorkspaceLayout>
  );
}

SignatureNotice.PreviewProps = {
  recipientName: "Ava Thompson",
  companyName: "Acme Inc.",
  heading: "Everyone has signed",
  paragraphs: ["The signed document and its completion certificate are attached."],
  rows: [{ label: "Document", value: "Employment agreement.pdf" }],
} satisfies SignatureNoticeProps;
