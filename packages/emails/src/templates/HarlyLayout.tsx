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
  hr as hrStyle,
  GENERIC_ACCENT,
} from "./styles";
import { SOCIAL_ICONS } from "./socialIcons";

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
  const accentColor = branding?.primaryColor || GENERIC_ACCENT;
  const workspaceName = branding?.name || "Harly";
  const hasLogo = Boolean(branding?.logoUrl);
  const socialLinks = (branding?.socialLinks || []).filter(
    (link) => link.url && link.url.trim().length > 0,
  );
  const hasSocialLinks = socialLinks.length > 0;

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
            <table cellPadding={0} cellSpacing={0} style={{ width: "100%" }}>
              <tbody>
                <tr>
                  <td style={{ verticalAlign: "middle" }}>
                    {hasLogo ? (
                      <Img
                        src={branding!.logoUrl!}
                        alt={workspaceName}
                        height={36}
                        style={{
                          display: "inline-block",
                          verticalAlign: "middle",
                          maxWidth: "120px",
                          height: "36px",
                          objectFit: "contain",
                        }}
                      />
                    ) : (
                      <>
                        <span style={logoBadge(accentColor)}>
                          {workspaceName.charAt(0).toUpperCase()}
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
                          {workspaceName}
                        </span>
                      </>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Section style={body}>{children}</Section>

          <Section style={{ ...body, paddingTop: 0 }}>
            <Hr style={hrStyle} />
            <Section style={footer}>
              {hasSocialLinks && (
                <table cellPadding={0} cellSpacing={0} style={{ marginBottom: "12px" }}>
                  <tbody>
                    <tr>
                      {socialLinks.map((link) => {
                        const iconPath = SOCIAL_ICONS[link.platform.toLowerCase()];
                        if (!iconPath) return null;
                        return (
                          <td key={link.platform} style={{ paddingRight: "12px" }}>
                            <a
                              href={link.url}
                              style={{ display: "inline-block", width: "20px", height: "20px", color: "#78716c" }}
                            >
                              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
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
                {workspaceName !== "Harly" ? (
                  <span style={{ display: "block", marginBottom: "4px" }}>
                    Sent by <strong>{workspaceName}</strong> via{" "}
                    <a href="https://harly.dev" style={{ color: "#78716c", textDecoration: "underline" }}>
                      Harly
                    </a>
                  </span>
                ) : (
                  <span style={{ display: "block", marginBottom: "4px" }}>
                    Powered by{" "}
                    <a href="https://harly.dev" style={{ color: "#78716c", textDecoration: "underline" }}>
                      Harly
                    </a>{" "}
                    · Open-source applicant tracking
                  </span>
                )}
              </Text>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
