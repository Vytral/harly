import { Body, Container, Head, Hr, Html, Preview, Section, Text } from "@react-email/components";

import { body, card, container, footer, footerRule, header, main, muted } from "./styles";
import { EmailLogo, poweredByHarlyInline } from "./EmailLogo";
import type { SocialLink } from "./HarlyLayout";

type WorkspaceLayoutProps = {
  preview: string;
  companyName: string;
  companyLogoUrl?: string;
  accentColor?: string;
  socialLinks?: SocialLink[];
  children: React.ReactNode;
};

/**
 * Layout for candidate-facing emails sent on behalf of a hiring company
 * (applications, interviews, offers, stage updates, rejections, withdrawals).
 * Header shows the company logo (email-optimized PNG from /api/logo/convert)
 * or a typographic lockup with the company name. Footer credits both the
 * sender company and "Powered by Harly".
 */
export function WorkspaceLayout({
  preview,
  companyName,
  companyLogoUrl,
  // accentColor and socialLinks are accepted for parity with the system
  // template props; the layout itself stays neutral so company branding
  // lives in the logo + per-template CTA color, not the chrome.
  accentColor: _accentColor,
  socialLinks: _socialLinks,
  children,
}: WorkspaceLayoutProps) {
  return (
    <Html lang="en">
      <Head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <EmailLogo logoUrl={companyLogoUrl} name={companyName} variant="workspace" />
          </Section>

          <Section style={card}>
            <Section style={body}>{children}</Section>
          </Section>

          <Section style={footer}>
            <Hr style={footerRule} />
            <Text style={muted}>
              Sent by {companyName} · {poweredByHarlyInline()}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
