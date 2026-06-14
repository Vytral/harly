/**
 * WorkspaceLayout — base shell for candidate-facing emails. Shows the
 * workspace's own logo/name and uses its primaryColor for CTA buttons.
 *
 * Pass accentColor (workspace.primaryColor) so the button matches the brand.
 * Pass companyName + optional companyLogoUrl for the header.
 */
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
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

type WorkspaceLayoutProps = {
  preview: string;
  companyName: string;
  companyLogoUrl?: string;
  /** workspace.primaryColor — used for logo badge fallback. */
  accentColor?: string;
  children: React.ReactNode;
};

export function WorkspaceLayout({
  preview,
  companyName,
  companyLogoUrl,
  accentColor = HARLY_ACCENT,
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
          {/* Header */}
          <Section style={header}>
            {companyLogoUrl ? (
              <Img
                src={companyLogoUrl}
                alt={companyName}
                height={36}
                style={{ display: "inline-block", verticalAlign: "middle" }}
              />
            ) : (
              <span style={logoBadge(accentColor)}>
                {companyName.charAt(0).toUpperCase()}
              </span>
            )}
            <span
              style={{
                color: "#1c1917",
                fontSize: "15px",
                fontWeight: 600,
                marginLeft: "10px",
                verticalAlign: "middle",
              }}
            >
              {companyName}
            </span>
          </Section>

          {/* Body */}
          <Section style={body}>{children}</Section>

          {/* Footer */}
          <Section style={{ ...body, paddingTop: 0 }}>
            <Hr style={hr} />
            <Section style={footer}>
              <Text style={muted}>
                Sent on behalf of {companyName} via{" "}
                <a
                  href="https://harly.dev"
                  style={{ color: "#78716c", textDecoration: "underline" }}
                >
                  Harly
                </a>
                . If you received this by mistake, you can ignore it.
              </Text>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
