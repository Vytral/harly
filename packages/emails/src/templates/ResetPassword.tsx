import { Button, Section, Text } from "@react-email/components";

import { buttonStyle, heading, text, HARLY_ACCENT } from "./styles";
import { HarlyLayout } from "./HarlyLayout";

export type ResetPasswordEmailProps = {
  userName: string;
  resetUrl: string;
};

export const resetPasswordSubject = "Reset your Harly password";

export function ResetPasswordEmail({
  userName,
  resetUrl,
}: ResetPasswordEmailProps) {
  return (
    <HarlyLayout preview="Reset your Harly password — link expires shortly.">
      <Text style={heading}>Reset your password</Text>
      <Text style={text}>Hi {userName},</Text>
      <Text style={text}>
        We received a request to reset the password for your Harly account.
        Click below to choose a new one. This link expires shortly.
      </Text>
      <Section style={{ marginTop: "24px" }}>
        <Button href={resetUrl} style={buttonStyle(HARLY_ACCENT)}>
          Reset password
        </Button>
      </Section>
      <Text style={{ ...text, marginTop: "24px", fontSize: "13px", color: "#78716c" }}>
        If you did not request a password reset, you can safely ignore this
        email — your password will not change.
      </Text>
    </HarlyLayout>
  );
}
