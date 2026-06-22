import { Button, Section, Text } from "@react-email/components";

import { buttonStyle, heading, text } from "./styles";
import { HarlyLayout, type WorkspaceEmailBranding } from "./HarlyLayout";

export type WelcomeEmailProps = {
  userName: string;
  workspaceName?: string;
  dashboardUrl: string;
  /** Optional workspace branding to customize the email appearance */
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
  const workspaceLabel = workspaceName ? ` for ${workspaceName}` : "";

  return (
    <HarlyLayout 
      preview={`Welcome to ${displayName}, ${userName}`}
      branding={branding}
    >
      <Text style={heading}>Welcome to {displayName}</Text>
      <Text style={text}>Hi {userName},</Text>
      <Text style={text}>
        Welcome to {displayName}. Create your first job posting, publish
        it to your job board, and start tracking candidates — all in one place.
      </Text>
      <Section style={{ marginTop: "24px" }}>
        <Button href={dashboardUrl} style={buttonStyle(branding?.primaryColor || undefined)}>
          Go to dashboard
        </Button>
      </Section>
      <Text style={{ ...text, marginTop: "24px", fontSize: "13px", color: "#78716c" }}>
        Harly is open source and self-hostable.
      </Text>
    </HarlyLayout>
  );
}
