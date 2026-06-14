/**
 * HarlyLayout — base shell for system emails (VerifyEmail, ResetPassword,
 * WorkspaceInvitation, WelcomeEmail). Branding is Harly's own.
 */
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

import {
  body,
  container,
  footer,
  header,
  logoBadge,
  main,
  muted,
  HARLY_ACCENT,
  hr,
} from "./styles";

type HarlyLayoutProps = {
  preview: string;
  children: React.ReactNode;
};

export function HarlyLayout({ preview, children }: HarlyLayoutProps) {
  return (
    <Html lang="en">
      <Head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <span style={logoBadge(HARLY_ACCENT)}>H</span>
            <span
              style={{
                color: "#1c1917",
                fontSize: "15px",
                fontWeight: 600,
                marginLeft: "10px",
                verticalAlign: "middle",
              }}
            >
              Harly
            </span>
          </Section>

          {/* Body */}
          <Section style={body}>{children}</Section>

          {/* Footer */}
          <Section style={{ ...body, paddingTop: 0 }}>
            <Hr style={hr} />
            <Section style={footer}>
              <Text style={muted}>
                Harly · Open-source applicant tracking ·{" "}
                <a
                  href="https://harly.dev"
                  style={{ color: "#78716c", textDecoration: "underline" }}
                >
                  harly.dev
                </a>
              </Text>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
