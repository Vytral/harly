import { Button, Hr, Section, Text } from "@react-email/components";

import { buttonStyle, divider, heading, muted, strong, text } from "./styles";
import { HarlyLayout, type WorkspaceEmailBranding } from "./HarlyLayout";

export type WorkspaceInvitationProps = {
  inviteeName: string;
  inviterName: string;
  workspaceName: string;
  role: string;
  acceptUrl: string;
  branding?: WorkspaceEmailBranding;
};

export function workspaceInvitationSubject({
  inviterName,
  workspaceName,
}: Pick<WorkspaceInvitationProps, "inviterName" | "workspaceName">) {
  return `${inviterName} invited you to ${workspaceName}`;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  hiring_manager: "Hiring Manager",
  recruiter: "Recruiter",
};

export function WorkspaceInvitation({
  inviteeName,
  inviterName,
  workspaceName,
  role,
  acceptUrl,
  branding,
}: WorkspaceInvitationProps) {
  const roleLabel = ROLE_LABELS[role] ?? "team member";

  return (
    <HarlyLayout
      preview={`${inviterName} added you to ${workspaceName} on Harly.`}
      branding={branding}
    >
      <Text style={heading}>You&apos;re invited to {workspaceName}</Text>
      <Text style={text}>Hi {inviteeName},</Text>
      <Text style={text}>
        <strong style={strong}>{inviterName}</strong> has added you to{" "}
        <strong style={strong}>{workspaceName}</strong> as a{" "}
        <strong style={strong}>{roleLabel}</strong>. Click below to accept and set up your account.
      </Text>
      <Section style={{ marginTop: "12px" }}>
        <Button href={acceptUrl} style={buttonStyle(branding?.primaryColor ?? undefined)}>
          Accept invitation  →
        </Button>
      </Section>
      <Hr style={divider} />
      <Text style={muted}>
        This invitation expires in 7 days. Not expecting this? You can safely ignore it.
      </Text>
    </HarlyLayout>
  );
}

WorkspaceInvitation.PreviewProps = {
  inviteeName: "Ava",
  inviterName: "Max",
  workspaceName: "Acme Inc.",
  role: "recruiter",
  acceptUrl: "https://app.harly.dev/join?token=abc123",
} satisfies WorkspaceInvitationProps;
