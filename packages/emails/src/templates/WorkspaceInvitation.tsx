import { Button, Hr, Section, Text } from "@react-email/components";

import { HarlyLayout, type WorkspaceEmailBranding } from "./HarlyLayout";
import { EmailFallbackLink } from "./EmailFallbackLink";

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
      <Text className="text-[40px] leading-[1.05] tracking-[-1px] font-inter text-fg m-0 mb-3.5 font-medium">
        You&apos;re invited to {workspaceName}
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">Hi {inviteeName},</Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        <span className="text-fg font-semibold">{inviterName}</span> has added you to{" "}
        <span className="text-fg font-semibold">{workspaceName}</span> as a{" "}
        <span className="text-fg font-semibold">{roleLabel}</span>. Click below to accept and set up your account.
      </Text>
      <Section className="mt-3">
        <Button
          href={acceptUrl}
          className="bg-brand text-[14px] leading-[1.5] font-inter text-fg-inverted inline-block border-none px-4 py-2.5 text-center box-border no-underline"
        >
          Accept invitation
        </Button>
        <EmailFallbackLink url={acceptUrl} />
      </Section>
      <Hr className="border-stroke border-t my-7" />
      <Text className="text-[13px] leading-[1.5] tracking-[-0.039px] font-inter text-fg-3 m-0">
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
