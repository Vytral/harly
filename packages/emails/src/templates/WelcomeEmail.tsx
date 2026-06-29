import { Button, Section, Text } from "@react-email/components";

import { buttonStyle, heading, text } from "./styles";
import { HarlyLayout, type WorkspaceEmailBranding } from "./HarlyLayout";

export type WelcomeEmailProps = {
  userName: string;
  workspaceName?: string;
  dashboardUrl: string;
  branding?: WorkspaceEmailBranding;
};

export const welcomeEmailSubject = "Welcome to Harly";

export function WelcomeEmail({
  userName,
  workspaceName,
  dashboardUrl,
  branding,
}: WelcomeEmailProps) {
  const displayName = workspaceName || branding?.name || "Harly";

  return (
    <HarlyLayout
      preview={`Welcome to ${displayName}, ${userName}. Let's get started.`}
      branding={branding}
    >
      <Text style={heading}>Welcome, {userName}</Text>
      <Text style={text}>
        Your {displayName} workspace is ready. Post your first job, publish it
        to your career page, and start tracking candidates — all in one place.
      </Text>
      <Section style={{ marginTop: "24px" }}>
        <Button href={dashboardUrl} style={buttonStyle(branding?.primaryColor ?? undefined)}>
          Open dashboard
        </Button>
      </Section>
    </HarlyLayout>
  );
}

WelcomeEmail.PreviewProps = {
  userName: "Ava",
  workspaceName: "Acme Inc.",
  dashboardUrl: "https://app.harly.dev/dashboard",
} satisfies WelcomeEmailProps;
