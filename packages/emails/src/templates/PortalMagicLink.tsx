import { Button, Hr, Section, Text } from "@react-email/components";

import { buttonStyle, divider, heading, muted, text } from "./styles";
import { HarlyLayout } from "./HarlyLayout";
import { HARLY_ACCENT } from "./styles";

export type PortalMagicLinkEmailProps = {
  candidateName?: string;
  loginUrl: string;
};

export function portalMagicLinkSubject() {
  return "Your sign-in link";
}

export function PortalMagicLinkEmail({ candidateName, loginUrl }: PortalMagicLinkEmailProps) {
  return (
    <HarlyLayout preview="Your sign-in link is ready — expires in 15 minutes.">
      <Text style={heading}>Sign in to your portal</Text>
      {candidateName ? <Text style={text}>Hi {candidateName},</Text> : null}
      <Text style={text}>
        Click below to sign in. This link works once and expires in 15 minutes.
      </Text>
      <Section style={{ marginTop: "12px" }}>
        <Button href={loginUrl} style={buttonStyle(HARLY_ACCENT)}>
          Sign in  →
        </Button>
      </Section>
      <Hr style={divider} />
      <Text style={muted}>Didn&apos;t request this? You can safely ignore it.</Text>
    </HarlyLayout>
  );
}

PortalMagicLinkEmail.PreviewProps = {
  candidateName: "Ava",
  loginUrl: "https://app.harly.dev/portal/login?token=abc123",
} satisfies PortalMagicLinkEmailProps;
