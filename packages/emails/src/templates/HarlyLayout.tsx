import { Body, Container, Head, Hr, Html, Preview, Section, Text } from "@react-email/components";

import { body, card, container, footer, footerRule, header, main, muted } from "./styles";
import { EmailLogo, poweredByHarlyInline } from "./EmailLogo";

export type SocialLink = {
  platform: string;
  url: string;
};

export type WorkspaceEmailBranding = {
  name: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  websiteUrl?: string | null;
  socialLinks?: SocialLink[];
};

type HarlyLayoutProps = {
  preview: string;
  children: React.ReactNode;
  branding?: WorkspaceEmailBranding;
};

/**
 * Layout for product-originated emails (welcome, verify, reset, magic link,
 * workspace invitation, recruiter notifications). Header shows the workspace
 * logo when branded, otherwise the Harly product lockup. Footer is always
 * "Powered by Harly" because these originate from the product itself.
 */
export function HarlyLayout({ preview, children, branding }: HarlyLayoutProps) {
  const workspaceName = branding?.name && branding.name !== "Harly" ? branding.name : "Harly";
  const hasBrandedLogo = Boolean(branding?.logoUrl);

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
            {hasBrandedLogo ? (
              <EmailLogo logoUrl={branding?.logoUrl} name={workspaceName} variant="workspace" />
            ) : (
              <EmailLogo name="Harly" variant="harly" />
            )}
          </Section>

          <Section style={card}>
            <Section style={body}>{children}</Section>
          </Section>

          <Section style={footer}>
            <Hr style={footerRule} />
            <Text style={muted}>
              {workspaceName !== "Harly" ? (
                <>
                  Sent by {workspaceName} · {poweredByHarlyInline()}
                </>
              ) : (
                poweredByHarlyInline()
              )}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
