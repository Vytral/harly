import {
  Body,
  Button,
  Container,
  Heading,
  Html,
  Section,
  Text,
} from "@react-email/components";

import { button, container, heading, main, muted, text } from "./styles";

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
    <Html>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Reset your password</Heading>
          <Text style={text}>Hi {userName},</Text>
          <Text style={text}>
            We received a request to reset the password for your Harly
            account. Click the button below to choose a new one. This link
            expires shortly.
          </Text>
          <Section style={{ marginTop: "24px" }}>
            <Button href={resetUrl} style={button}>
              Reset password
            </Button>
          </Section>
          <Text style={{ ...muted, marginTop: "28px" }}>
            If you did not request a password reset, you can safely ignore
            this email — your password will not change.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
