import { Button, Section, Text } from "@react-email/components";

import { buttonStyle, heading, text } from "./styles";
import { HarlyLayout } from "./HarlyLayout";
import { HARLY_ACCENT } from "./styles";

export type VerifyEmailProps = {
  userName: string;
  verifyUrl: string;
};

export const verifyEmailSubject = "Verify your email";

export function VerifyEmail({ userName, verifyUrl }: VerifyEmailProps) {
  return (
    <HarlyLayout preview="One click and you're in — verify your Harly email.">
      <Text style={heading}>Verify your email</Text>
      <Text style={text}>Hi {userName},</Text>
      <Text style={text}>
        Click the button below to confirm your address and finish setting up
        your account. This link expires in 24 hours.
      </Text>
      <Section style={{ marginTop: "24px" }}>
        <Button href={verifyUrl} style={buttonStyle(HARLY_ACCENT)}>
          Verify email
        </Button>
      </Section>
      <Text style={{ ...text, fontSize: "13px", color: "#78716c", marginTop: "24px" }}>
        Didn&apos;t sign up for Harly? You can safely ignore this email.
      </Text>
    </HarlyLayout>
  );
}

VerifyEmail.PreviewProps = {
  userName: "Ava",
  verifyUrl: "https://app.harly.dev/verify?token=abc123",
} satisfies VerifyEmailProps;
