import { Button, Section, Text } from "@react-email/components";

import { buttonStyle, heading, text, HARLY_ACCENT } from "./styles";
import { HarlyLayout } from "./HarlyLayout";

export type WelcomeEmailProps = {
  userName: string;
  workspaceName?: string;
  dashboardUrl: string;
};

export const welcomeEmailSubject = "Welcome to Harly";

export function WelcomeEmail({
  userName,
  workspaceName,
  dashboardUrl,
}: WelcomeEmailProps) {
  const workspaceLabel = workspaceName ? ` for ${workspaceName}` : "";

  return (
    <HarlyLayout preview={`Welcome to Harly${workspaceLabel}, ${userName}`}>
      <Text style={heading}>Welcome to Harly</Text>
      <Text style={text}>Hi {userName},</Text>
      <Text style={text}>
        Welcome to Harly{workspaceLabel}. Create your first job posting, publish
        it to your job board, and start tracking candidates — all in one place.
      </Text>
      <Section style={{ marginTop: "24px" }}>
        <Button href={dashboardUrl} style={buttonStyle(HARLY_ACCENT)}>
          Go to dashboard
        </Button>
      </Section>
      <Text style={{ ...text, marginTop: "24px", fontSize: "13px", color: "#78716c" }}>
        Harly is open source and self-hostable.
      </Text>
    </HarlyLayout>
  );
}
