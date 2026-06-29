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
  GENERIC_ACCENT,
  hr as hrStyle,
} from "./styles";
import { SOCIAL_ICONS } from "./socialIcons";
import type { SocialLink } from "./HarlyLayout";

type WorkspaceLayoutProps = {
  preview: string;
  companyName: string;
  companyLogoUrl?: string;
  accentColor?: string;
  socialLinks?: SocialLink[];
  children: React.ReactNode;
};

export function WorkspaceLayout({
  preview,
  companyName,
  companyLogoUrl,
  accentColor = GENERIC_ACCENT,
  socialLinks = [],
  children,
}: WorkspaceLayoutProps) {
  const validSocials = socialLinks.filter((l) => l.url?.trim());

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
            {companyLogoUrl ? (
              <Img
                src={companyLogoUrl}
                alt={companyName}
                height={36}
                style={{
                  display: "inline-block",
                  verticalAlign: "middle",
                  maxWidth: "120px",
                  objectFit: "contain",
                }}
              />
            ) : (
              <>
                <span style={logoBadge(accentColor)}>
                  {companyName.charAt(0).toUpperCase()}
                </span>
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
              </>
            )}
          </Section>

          <Section style={body}>{children}</Section>

          <Section style={{ ...body, paddingTop: 0 }}>
            <Hr style={hrStyle} />
            <Section style={footer}>
              {validSocials.length > 0 && (
                <table cellPadding={0} cellSpacing={0} style={{ marginBottom: "12px" }}>
                  <tbody>
                    <tr>
                      {validSocials.map((link) => {
                        const iconPath = SOCIAL_ICONS[link.platform.toLowerCase()];
                        if (!iconPath) return null;
                        return (
                          <td key={link.platform} style={{ paddingRight: "12px" }}>
                            <a href={link.url} style={{ display: "inline-block", color: "#78716c" }}>
                              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                                <path d={iconPath} />
                              </svg>
                            </a>
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              )}
              <Text style={muted}>
                This email was sent by {companyName}.
              </Text>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
