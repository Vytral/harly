import { Button, Section, Text } from "@react-email/components";
import { HarlyLayout } from "./HarlyLayout";
import { buttonStyle, heading, text } from "./styles";

export function PortalMagicLinkEmail({
  loginUrl,
}: {
  loginUrl: string;
}) {
  return (
    <HarlyLayout preview="Your sign-in link for the candidate portal">
      <Text style={heading}>Sign in to your portal</Text>
      <Text style={text}>
        Click the button below to sign in to your candidate portal. The link
        expires in 15 minutes.
      </Text>
      <Section style={{ marginTop: "24px" }}>
        <Button href={loginUrl} style={buttonStyle()}>
          Sign in
        </Button>
      </Section>
      <Text style={{ ...text, marginTop: "16px", fontSize: "13px" }}>
        If you did not request this, you can safely ignore this email.
      </Text>
    </HarlyLayout>
  );
}

export function portalMagicLinkSubject() {
  return "Sign in to your candidate portal";
}
