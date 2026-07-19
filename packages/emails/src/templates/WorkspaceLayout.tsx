import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

import { harlyTailwindConfig } from "./theme";
import { HarlyFonts } from "./HarlyFonts";
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
 * Structure mirrors the Resend "Matte" demo: a card lifted on the paper
 * canvas by a diffuse evergreen-tinted shadow, with an inner bordered
 * surface. Header shows the company logo (email-optimized PNG from
 * /api/logo/convert) or a typographic lockup with the company name. Footer
 * credits both the sender company and "Powered by Harly".
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
    <Tailwind config={harlyTailwindConfig}>
      <Html lang="en">
        <Head>
          <HarlyFonts />
        </Head>
        <Preview>{preview}</Preview>
        <Body className="bg-canvas font-inter text-[14px] leading-[1.5] text-fg m-0 p-0">
          <Container className="mx-auto max-w-card px-4 pt-16 pb-6">
            <Section className="shadow-harly-card rounded-[14px]">
              <Section className="border-stroke rounded-[14px] border bg-bg overflow-hidden">
                {/* Header — company logo / lockup + evergreen accent rule */}
                <Section className="px-10 pt-10 pb-7">
                  <EmailLogo
                    logoUrl={companyLogoUrl}
                    name={companyName}
                    variant="workspace"
                  />
                </Section>
                <Section className="border-brand border-t-4" />

                {/* Body */}
                <Section className="px-10 pt-10 pb-14 text-left">
                  {children}
                </Section>

                {/* Footer */}
                <Section className="border-stroke border-t px-10 py-12">
                  <Text className="text-[13px] leading-[1.5] tracking-[-0.039px] font-inter text-fg-3 m-0">
                    Sent by {companyName} · {poweredByHarlyInline()}
                  </Text>
                </Section>
              </Section>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}
