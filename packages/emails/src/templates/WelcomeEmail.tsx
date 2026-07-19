import { Button, Section, Text } from "@react-email/components";

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
      <Text className="text-[32px] leading-[1.2] tracking-[-0.6px] font-inter text-fg m-0 mb-3.5 font-bold">
        Welcome, {userName}
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        Your {displayName} workspace is ready. Post your first job, publish it
        to your career page, and start tracking candidates — all in one place.
      </Text>
      <Section className="mt-3">
        <Button
          href={dashboardUrl}
          className="bg-brand text-[15px] leading-[1.5] tracking-[-0.075px] font-inter text-fg-inverted inline-block border-none px-6 py-3.5 text-center box-border no-underline"
        >
          Open dashboard  →
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
