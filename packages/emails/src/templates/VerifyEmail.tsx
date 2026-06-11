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

export type VerifyEmailProps = {
  userName: string;
  verifyUrl: string;
};

export const verifyEmailSubject = "Verify your email for Harly";

export function VerifyEmail({ userName, verifyUrl }: VerifyEmailProps) {
  return (
    <Html>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Verify your email</Heading>
          <Text style={text}>Hi {userName},</Text>
          <Text style={text}>
            Confirm this email address to finish setting up your Harly
            account.
          </Text>
          <Section style={{ marginTop: "24px" }}>
            <Button href={verifyUrl} style={button}>
              Verify email
            </Button>
          </Section>
          <Text style={{ ...muted, marginTop: "28px" }}>
            If you did not create a Harly account, you can ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
