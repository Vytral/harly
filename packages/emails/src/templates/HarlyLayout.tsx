import { Body, Container, Head, Html, Preview, Section, Text } from "@react-email/components";

import { body, container, footer, main, muted } from "./styles";

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

export function HarlyLayout({ preview, children, branding }: HarlyLayoutProps) {
  const workspaceName = branding?.name || "Harly";

  return (
    <Html lang="en">
      <Head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={body}>{children}</Section>

          <Section style={footer}>
            <Text style={muted}>
              {workspaceName !== "Harly" ? (
                <>
                  Sent by {workspaceName} via{" "}
                  <a href="https://harly.dev" style={{ color: "#78716c", textDecoration: "underline" }}>
                    Harly
                  </a>
                </>
              ) : (
                <>
                  Powered by{" "}
                  <a href="https://harly.dev" style={{ color: "#78716c", textDecoration: "underline" }}>
                    Harly
                  </a>
                </>
              )}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
