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

export type WelcomeEmailProps = {
  userName: string;
  workspaceName?: string;
};

export const welcomeEmailSubject = "Welcome to Harly";

export function WelcomeEmail({ userName, workspaceName }: WelcomeEmailProps) {
  const workspaceLabel = workspaceName ? ` for ${workspaceName}` : "";

  return (
    <Html>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Welcome to Harly</Heading>
          <Text style={text}>Hi {userName},</Text>
          <Text style={text}>
            Welcome to Harly{workspaceLabel}. You can now create your first
            job posting, publish it to your job board, and start tracking
            candidates.
          </Text>
          <Section style={{ marginTop: "24px" }}>
            <Button href="/dashboard/jobs/new" style={button}>
              Create your first job
            </Button>
          </Section>
          <Text style={{ ...muted, marginTop: "28px" }}>
            Harly is open source and self-hostable by default.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
