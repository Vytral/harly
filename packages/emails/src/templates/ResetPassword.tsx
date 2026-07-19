import { Button, Hr, Section, Text } from "@react-email/components";

import { HarlyLayout } from "./HarlyLayout";

export type ResetPasswordEmailProps = {
  userName: string;
  resetUrl: string;
};

export const resetPasswordSubject = "Reset your password";

export function ResetPasswordEmail({ userName, resetUrl }: ResetPasswordEmailProps) {
  return (
    <HarlyLayout preview="Reset your Harly password — this link expires in 1 hour.">
      <Text className="text-[32px] leading-[1.2] tracking-[-0.6px] font-inter text-fg m-0 mb-3.5 font-bold">
        Reset your password
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">Hi {userName},</Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        Someone requested a password reset for your Harly account. Click below to
        set a new one. The link expires in 1 hour.
      </Text>
      <Section className="mt-3">
        <Button
          href={resetUrl}
          className="bg-brand text-[15px] leading-[1.5] tracking-[-0.075px] font-inter text-fg-inverted inline-block border-none px-6 py-3.5 text-center box-border no-underline"
        >
          Reset password  →
        </Button>
      </Section>
      <Hr className="border-stroke border-t my-7" />
      <Text className="text-[13px] leading-[1.5] tracking-[-0.039px] font-inter text-fg-3 m-0">
        Didn&apos;t request this? Your password won&apos;t change — you can safely ignore this email.
      </Text>
    </HarlyLayout>
  );
}

ResetPasswordEmail.PreviewProps = {
  userName: "Ava",
  resetUrl: "https://app.harly.dev/reset-password?token=abc123",
} satisfies ResetPasswordEmailProps;
