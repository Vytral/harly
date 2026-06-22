import { Button, Section, Text } from "@react-email/components";

import { buttonStyle, heading, text } from "./styles";
import { HarlyLayout, type WorkspaceEmailBranding } from "./HarlyLayout";

export type WorkspaceInvitationProps = {
  inviterName: string;
  workspaceName: string;
  role: string;
  acceptUrl: string;
  branding?: WorkspaceEmailBranding;
};

export function workspaceInvitationSubject({
  workspaceName,
}: {
  workspaceName: string;
}) {
  return `You've been invited to join ${workspaceName} on Harly`;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  hiring_manager: "Hiring Manager",
  recruiter: "Recruiter",
};

export function WorkspaceInvitation({
  inviterName,
  workspaceName,
  role,
  acceptUrl,
  branding,
}: WorkspaceInvitationProps) {
  const roleLabel = ROLE_LABELS[role] ?? "Recruiter";

  return (
    <HarlyLayout
      preview={`${inviterName} invited you to join ${workspaceName} on Harly as ${roleLabel}.`}
      branding={branding}
    >
      <Text style={heading}>You&apos;re invited</Text>
      <Text style={text}>Hi there,</Text>
      <Text style={text}>
        <strong>{inviterName}</strong> has invited you to join{" "}
        <strong>{workspaceName}</strong> as a <strong>{roleLabel}</strong> on
        Harly — an open-source applicant tracking system.
      </Text>
      <Section style={{ marginTop: "24px" }}>
        <Button href={acceptUrl} style={buttonStyle(branding?.primaryColor || undefined)}>
          Accept invitation
        </Button>
      </Section>
      <Text style={{ ...text, marginTop: "24px", fontSize: "13px", color: "#78716c" }}>
        This invitation expires in 7 days. If you were not expecting this, you
        can safely ignore it.
      </Text>
    </HarlyLayout>
  );
}
