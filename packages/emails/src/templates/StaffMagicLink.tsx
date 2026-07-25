import { Button, Hr, Section, Text } from "@react-email/components";

import { HarlyLayout } from "./HarlyLayout";
import { EmailFallbackLink } from "./EmailFallbackLink";

export type StaffMagicLinkEmailProps = {
  loginUrl: string;
};

export function staffMagicLinkSubject() {
  return "Sign in to Harly";
}

export function StaffMagicLinkEmail({ loginUrl }: StaffMagicLinkEmailProps) {
  return (
    <HarlyLayout preview="Your sign-in link is ready.">
      <Text className="text-[40px] leading-[1.05] tracking-[-1px] font-inter text-fg m-0 mb-3.5 font-medium">
        Sign in to Harly
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        Click below to sign in. If you did not request this, you can safely
        ignore this email.
      </Text>
      <Section className="mt-3">
        <Button
          href={loginUrl}
          className="bg-brand text-[14px] leading-[1.5] font-inter text-fg-inverted inline-block border-none px-4 py-2.5 text-center box-border no-underline"
        >
          Sign in
        </Button>
        <EmailFallbackLink url={loginUrl} />
      </Section>
      <Hr className="border-stroke border-t my-7" />
      <Text className="text-[13px] leading-[1.5] tracking-[-0.039px] font-inter text-fg-3 m-0">
        Didn&apos;t request this? You can safely ignore it.
      </Text>
    </HarlyLayout>
  );
}

StaffMagicLinkEmail.PreviewProps = {
  loginUrl: "https://app.harly.dev/api/auth/magic-link/verify?token=abc123",
} satisfies StaffMagicLinkEmailProps;
