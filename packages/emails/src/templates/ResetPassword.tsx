import { Button, Hr, Section, Text } from "@react-email/components";

import { buttonStyle, divider, heading, muted, text } from "./styles";
import { HarlyLayout } from "./HarlyLayout";
import { HARLY_ACCENT } from "./styles";

export type ResetPasswordEmailProps = {
  userName: string;
  resetUrl: string;
};

export const resetPasswordSubject = "Reset your password";

export function ResetPasswordEmail({ userName, resetUrl }: ResetPasswordEmailProps) {
  return (
    <HarlyLayout preview="Reset your Harly password — this link expires in 1 hour.">
      <Text style={heading}>Reset your password</Text>
      <Text style={text}>Hi {userName},</Text>
      <Text style={text}>
        Someone requested a password reset for your Harly account. Click below to
        set a new one. The link expires in 1 hour.
      </Text>
      <Section style={{ marginTop: "12px" }}>
        <Button href={resetUrl} style={buttonStyle(HARLY_ACCENT)}>
          Reset password  →
        </Button>
      </Section>
      <Hr style={divider} />
      <Text style={muted}>
        Didn&apos;t request this? Your password won&apos;t change — you can safely ignore this email.
      </Text>
    </HarlyLayout>
  );
}

ResetPasswordEmail.PreviewProps = {
  userName: "Ava",
  resetUrl: "https://app.harly.dev/reset-password?token=abc123",
} satisfies ResetPasswordEmailProps;
