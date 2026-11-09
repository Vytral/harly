import { WorkspaceLayout } from "./WorkspaceLayout";
import type { SocialLink } from "./HarlyLayout";
import { emailTranslator } from "../i18n";

export type CustomTemplateEmailProps = {
  locale?: string | null;
  /** Already interpolated + sanitized by renderActiveEmailTemplate(). */
  bodyHtml: string;
  companyName: string;
  companyLogoUrl?: string;
  accentColor?: string;
  socialLinks?: SocialLink[];
  hideBranding?: boolean;
};

/**
 * Renders a workspace-authored template (from features/email-templates) in
 * the same branded shell as the hardcoded system templates. The body HTML
 * comes from the admin's Tiptap editor, already interpolated and sanitized —
 * this component never touches raw, un-sanitized input.
 */
export function CustomTemplateEmail({
  locale,
  bodyHtml,
  companyName,
  companyLogoUrl,
  accentColor,
  socialLinks,
  hideBranding,
}: CustomTemplateEmailProps) {
  const t = emailTranslator(locale);
  return (
    <WorkspaceLayout
      preview={t("customTemplate.preview", { company: companyName })}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      accentColor={accentColor}
      socialLinks={socialLinks}
      hideBranding={hideBranding}
      locale={locale}
    >
      {/* eslint-disable-next-line react/no-danger -- bodyHtml is sanitized upstream in renderActiveEmailTemplate() */}
      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </WorkspaceLayout>
  );
}

CustomTemplateEmail.PreviewProps = {
  bodyHtml: "<p>Hi Ava,</p><p>This is a workspace-authored template.</p>",
  companyName: "Acme Inc.",
  locale: "en",
} satisfies CustomTemplateEmailProps;
