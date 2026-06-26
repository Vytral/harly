/**
 * WorkspaceLayout — base shell for candidate-facing emails. Shows the
 * workspace's own logo/name and uses its primaryColor for CTA buttons.
 *
 * Pass accentColor (workspace.primaryColor) so the button matches the brand.
 * Pass companyName + optional companyLogoUrl for the header.
 * Pass socialLinks (from careerPageConfig.footer.socials) for footer icons.
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
  GENERIC_ACCENT,
  hr as hrStyle,
} from "./styles";
import type { SocialLink } from "./HarlyLayout";

// Social icon SVG paths — same set as HarlyLayout
const SOCIAL_ICONS: Record<string, string> = {
  x: "M18.244 2.25h4.284l-5.966 6.807L23.5 21.75h-5.602l-4.064-5.29-4.65 5.29H4.5l6.588-7.513L4.086 2.25H9.88l3.816 5.018 4.418-5.018z",
  linkedin: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.06 2.06 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065m1.782 13.019H3.555V9h3.564zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0z",
  github: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
  instagram: "M7.03.084c-1.277.06-2.149.264-2.91.563a5.9 5.9 0 00-2.124 1.388 5.9 5.9 0 00-1.38 2.127C.321 4.926.12 5.8.064 7.076s-.069 1.688-.063 4.947.021 3.667.083 4.947c.061 1.277.264 2.149.563 2.911a5.9 5.9 0 001.388 2.123 5.9 5.9 0 002.129 1.38c.763.295 1.636.496 2.913.552 1.278.056 1.689.069 4.947.063s3.668-.021 4.947-.082c1.28-.06 2.147-.265 2.91-.563a5.9 5.9 0 002.123-1.388 5.9 5.9 0 001.38-2.129c.295-.763.496-1.636.551-2.912.056-1.28.07-1.69.063-4.948-.006-3.258-.02-3.667-.081-4.947-.06-1.28-.264-2.148-.564-2.911a5.9 5.9 0 00-1.387-2.123 5.9 5.9 0 00-2.128-1.38c-.764-.294-1.636-.496-2.914-.55C15.647.009 15.236-.006 11.977 0S8.31.021 7.03.084",
  youtube: "M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814M9.545 15.568V8.432L15.818 12z",
  facebook: "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a9 9 0 011.141.195v3.325a9 9 0 00-.653-.036 27 27 0 00-.733-.009c-.707 0-1.259.096-1.675.309a1.7 1.7 0 00-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647",
  discord: "M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.061.061 0 00-.031.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03M8.02 15.33c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418m7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418",
  website: "M16.36 14c.08-.66.14-1.32.14-2s-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2m-5.15 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 01-4.33 3.56M14.34 14H9.66c-.1-.66-.16-1.32-.16-2s.06-1.35.16-2h4.68c.09.65.16 1.32.16 2s-.07 1.34-.16 2M12 19.96c-.83-1.2-1.5-2.53-1.91-3.96h3.82c-.41 1.43-1.08 2.76-1.91 3.96M8 8H5.08A7.923 7.923 0 019.4 4.44C8.8 5.55 8.35 6.75 8 8m-2.92 8H8c.35 1.25.8 2.45 1.4 3.56A8 8 0 015.08 16m-.82-2C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2s.06 1.34.14 2M12 4.03c.83 1.2 1.5 2.54 1.91 3.97h-3.82c.41-1.43 1.08-2.77 1.91-3.97M18.92 8h-2.95a15.65 15.65 0 00-1.38-3.56c1.84.63 3.37 1.9 4.33 3.56M12 2C6.47 2 2 6.5 2 12a10 10 0 0010 10 10 10 0 0010-10A10 10 0 0012 2z",
};

type WorkspaceLayoutProps = {
  preview: string;
  companyName: string;
  companyLogoUrl?: string;
  /** workspace.primaryColor — used for logo badge fallback. */
  accentColor?: string;
  /** Social links from careerPageConfig.footer.socials */
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
          {/* Header */}
          <Section style={header}>
            {companyLogoUrl ? (
              <Img
                src={companyLogoUrl}
                alt={companyName}
                height={36}
                style={{ display: "inline-block", verticalAlign: "middle", maxWidth: "120px", objectFit: "contain" }}
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

          {/* Body */}
          <Section style={body}>{children}</Section>

          {/* Footer */}
          <Section style={{ ...body, paddingTop: 0 }}>
            <Hr style={hrStyle} />
            <Section style={footer}>
              {/* Social links */}
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

              {/* Workspace branding only — no Harly footer for candidate-facing emails */}
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
