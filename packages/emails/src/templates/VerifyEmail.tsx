import { Button, Section, Text } from "@react-email/components";

import { buttonStyle, heading, text } from "./styles";
import { HarlyLayout, type WorkspaceEmailBranding } from "./HarlyLayout";

export type VerifyEmailProps = {
  userName: string;
  verifyUrl: string;
  /** Optional workspace branding to customize the email appearance */
  branding?: WorkspaceEmailBranding;
};

export const verifyEmailSubject = "Verify your email for Harly";

export function VerifyEmail({ userName, verifyUrl, branding }: VerifyEmailProps) {
  return (
    <HarlyLayout 
      preview="Confirm your email address to finish setting up your Harly account."
      branding={branding}
    >
      <Text style={heading}>Verify your email</Text>
      <Text style={text}>Hi {userName},</Text>
      <Text style={text}>
        Confirm this email address to finish setting up your Harly account.
      </Text>
      <Section style={{ marginTop: "24px" }}>
        <Button href={verifyUrl} style={buttonStyle(branding?.primaryColor || undefined)}>
          Verify email
        </Button>
      </Section>
      <Text style={{ ...text, marginTop: "24px", fontSize: "13px", color: "#78716c" }}>
        If you did not create a Harly account, you can safely ignore this email.
      </Text>
    </HarlyLayout>
  );
}
