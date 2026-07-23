import { Button, Hr, Section, Text } from "@react-email/components";

import { HarlyLayout } from "./HarlyLayout";
import { EmailFallbackLink } from "./EmailFallbackLink";

export type VerifyEmailProps = {
  userName: string;
  verifyUrl: string;
};

export const verifyEmailSubject = "Verify your email";

export function VerifyEmail({ userName, verifyUrl }: VerifyEmailProps) {
  return (
    <HarlyLayout preview="One click and you're in — verify your Harly email.">
      <Text className="text-[40px] leading-[1.05] tracking-[-1px] font-inter text-fg m-0 mb-3.5 font-medium">
        Verify your email
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        Hi {userName},
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        Click the button below to confirm your address and finish setting up your
        account. This link expires in 24 hours.
      </Text>
      <Section className="mt-3">
        <Button
          href={verifyUrl}
          className="bg-brand text-[14px] leading-[1.5] font-inter text-fg-inverted inline-block border-none px-4 py-2.5 text-center box-border no-underline"
        >
          Verify email
        </Button>
        <EmailFallbackLink url={verifyUrl} />
      </Section>
      <Hr className="border-stroke border-t my-7" />
      <Text className="text-[13px] leading-[1.5] tracking-[-0.039px] font-inter text-fg-3 m-0">
        Didn&apos;t sign up for Harly? You can safely ignore this email.
      </Text>
    </HarlyLayout>
  );
}

VerifyEmail.PreviewProps = {
  userName: "Ava",
  verifyUrl: "https://app.harly.dev/verify?token=abc123",
} satisfies VerifyEmailProps;
