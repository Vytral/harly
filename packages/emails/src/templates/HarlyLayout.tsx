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
 * workspace invitation, recruiter notifications). Structure mirrors the
 * Resend "Matte" demo: a card lifted on the paper canvas by a diffuse
 * evergreen-tinted shadow, with an inner bordered surface. Header shows the
 * workspace logo when branded, otherwise the Harly product wordmark. Footer
 * is always "Powered by Harly" because these originate from the product.
 */
export function HarlyLayout({ preview, children, branding }: HarlyLayoutProps) {
  const workspaceName =
    branding?.name && branding.name !== "Harly" ? branding.name : "Harly";
  const hasBrandedLogo = Boolean(branding?.logoUrl);

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
                {/* Header — logo + evergreen accent rule beneath it */}
                <Section className="px-10 pt-10 pb-7">
                  <EmailLogo
                    logoUrl={hasBrandedLogo ? branding?.logoUrl : undefined}
                    name={workspaceName}
                    variant={hasBrandedLogo ? "workspace" : "harly"}
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
                    {workspaceName !== "Harly" ? (
                      <>
                        Sent by {workspaceName} · {poweredByHarlyInline()}
                      </>
                    ) : (
                      poweredByHarlyInline()
                    )}
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
