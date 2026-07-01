import { Body, Container, Head, Html, Preview, Section, Text } from "@react-email/components";

import { body, container, footer, main, muted } from "./styles";
import type { SocialLink } from "./HarlyLayout";

type WorkspaceLayoutProps = {
  preview: string;
  companyName: string;
  companyLogoUrl?: string;
  accentColor?: string;
  socialLinks?: SocialLink[];
  children: React.ReactNode;
};

export function WorkspaceLayout({ preview, companyName, children }: WorkspaceLayoutProps) {
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
            <Text style={muted}>This email was sent by {companyName}.</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
