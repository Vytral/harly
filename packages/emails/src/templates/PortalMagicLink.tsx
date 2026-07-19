import { Button, Hr, Section, Text } from "@react-email/components";

import { HarlyLayout } from "./HarlyLayout";

export type PortalMagicLinkEmailProps = {
  candidateName?: string;
  loginUrl: string;
};

export function portalMagicLinkSubject() {
  return "Your sign-in link";
}

export function PortalMagicLinkEmail({ candidateName, loginUrl }: PortalMagicLinkEmailProps) {
  return (
    <HarlyLayout preview="Your sign-in link is ready — expires in 15 minutes.">
      <Text className="text-[32px] leading-[1.2] tracking-[-0.6px] font-inter text-fg m-0 mb-3.5 font-bold">
        Sign in to your portal
      </Text>
      {candidateName ? (
        <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">Hi {candidateName},</Text>
      ) : null}
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        Click below to sign in. This link works once and expires in 15 minutes.
      </Text>
      <Section className="mt-3">
        <Button
          href={loginUrl}
          className="bg-brand text-[15px] leading-[1.5] tracking-[-0.075px] font-inter text-fg-inverted inline-block border-none px-6 py-3.5 text-center box-border no-underline"
        >
          Sign in  →
        </Button>
      </Section>
      <Hr className="border-stroke border-t my-7" />
      <Text className="text-[13px] leading-[1.5] tracking-[-0.039px] font-inter text-fg-3 m-0">
        Didn&apos;t request this? You can safely ignore it.
      </Text>
    </HarlyLayout>
  );
}

PortalMagicLinkEmail.PreviewProps = {
  candidateName: "Ava",
  loginUrl: "https://app.harly.dev/portal/login?token=abc123",
} satisfies PortalMagicLinkEmailProps;
