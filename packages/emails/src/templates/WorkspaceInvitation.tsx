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

export type WorkspaceInvitationProps = {
  inviterName: string;
  workspaceName: string;
  role: string;
  acceptUrl: string;
};

export function workspaceInvitationSubject({
  workspaceName,
}: {
  workspaceName: string;
}) {
  return `You've been invited to join ${workspaceName} on OpenHire`;
}

export function WorkspaceInvitation({
  inviterName,
  workspaceName,
  role,
  acceptUrl,
}: WorkspaceInvitationProps) {
  const roleLabel =
    role === "owner"
      ? "Owner"
      : role === "admin"
        ? "Admin"
        : role === "hiring_manager"
          ? "Hiring Manager"
          : "Recruiter";

  return (
    <Html>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>You&apos;re invited to OpenHire</Heading>
          <Text style={text}>Hi there,</Text>
          <Text style={text}>
            <strong>{inviterName}</strong> has invited you to join{" "}
            <strong>{workspaceName}</strong> as a{" "}
            <strong>{roleLabel}</strong> on OpenHire.
          </Text>
          <Text style={text}>
            OpenHire is an open-source applicant tracking system. Click the
            button below to accept your invitation and get started.
          </Text>
          <Section style={{ marginTop: "24px" }}>
            <Button href={acceptUrl} style={button}>
              Accept invitation
            </Button>
          </Section>
          <Text style={{ ...muted, marginTop: "28px" }}>
            This invitation expires in 7 days. If you were not expecting this
            invitation, you can safely ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
