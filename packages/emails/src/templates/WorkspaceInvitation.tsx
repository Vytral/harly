import { Button, Hr, Section, Text } from "@react-email/components";

import { emailTranslator } from "../i18n";
import { HarlyLayout, type WorkspaceEmailBranding } from "./HarlyLayout";
import { EmailFallbackLink } from "./EmailFallbackLink";

export type WorkspaceInvitationProps = {
  inviteeName: string;
  locale?: string | null;
  inviterName: string;
  workspaceName: string;
  role: string;
  acceptUrl: string;
  branding?: WorkspaceEmailBranding;
};

export function workspaceInvitationSubject({
  inviterName,
  workspaceName,
  locale,
}: Pick<WorkspaceInvitationProps, "inviterName" | "workspaceName" | "locale">) {
  return emailTranslator(locale)("invitation.subject", { inviter: inviterName, workspace: workspaceName });
}

const ROLE_KEYS = ["owner", "admin", "hiring_manager", "recruiter", "coordinator", "sourcer", "interviewer", "viewer"] as const;
type RoleKey = (typeof ROLE_KEYS)[number];

export function WorkspaceInvitation({
  inviteeName,
  locale,
  inviterName,
  workspaceName,
  role,
  acceptUrl,
  branding,
}: WorkspaceInvitationProps) {
  const t = emailTranslator(locale);
  const roleKey: RoleKey | "fallback" = (ROLE_KEYS as readonly string[]).includes(role) ? role as RoleKey : "fallback";
  const roleLabel = t(`invitation.roles.${roleKey}`);

  return (
    <HarlyLayout
      preview={t("invitation.preview", { inviter: inviterName, workspace: workspaceName })}
      locale={locale}
      branding={branding}
    >
      <Text className="text-[40px] leading-[1.05] tracking-[-1px] font-inter text-fg m-0 mb-3.5 font-medium">
        {t("invitation.heading", { workspace: workspaceName })}
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">{t("common.greeting", { name: inviteeName })}</Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        {t.rich("invitation.body", { inviter: inviterName, workspace: workspaceName, role: roleLabel, strong: (chunks) => <span className="text-fg font-semibold">{chunks}</span> })}
      </Text>
      <Section className="mt-3">
        <Button
          href={acceptUrl}
          className="bg-brand text-[14px] leading-[1.5] font-inter text-fg-inverted inline-block border-none px-4 py-2.5 text-center box-border no-underline"
        >
          {t("invitation.button")}
        </Button>
        <EmailFallbackLink url={acceptUrl} locale={locale} />
      </Section>
      <Hr className="border-stroke border-t my-7" />
      <Text className="text-[13px] leading-[1.5] tracking-[-0.039px] font-inter text-fg-3 m-0">
        {t("invitation.notice")}
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
