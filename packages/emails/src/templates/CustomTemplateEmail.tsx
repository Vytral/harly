import { WorkspaceLayout } from "./WorkspaceLayout";
import type { SocialLink } from "./HarlyLayout";
import { emailTranslator } from "../i18n";

export type CustomTemplateEmailProps = {
  locale?: string | null;
  /**
   * Trusted HTML. The caller MUST interpolate with escaped values and run it
   * through sanitizeTemplateHtml() (apps/web) first: this component renders it
   * verbatim and does no sanitizing of its own.
   */
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
 * comes from the admin's Tiptap editor and is rendered as-is. This package has
 * no sanitizer: every caller must pass HTML that has already been
 * interpolated with escaped values and sanitized with sanitizeTemplateHtml().
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
      {/* eslint-disable-next-line react/no-danger -- bodyHtml must be sanitized by the caller (see sanitizeTemplateHtml in apps/web) */}
      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </WorkspaceLayout>
  );
}

CustomTemplateEmail.PreviewProps = {
  bodyHtml: "<p>Hi Ava,</p><p>This is a workspace-authored template.</p>",
  companyName: "Acme Inc.",
  locale: "en",
} satisfies CustomTemplateEmailProps;
