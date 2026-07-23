import { Button, Text } from "@react-email/components";

import { HarlyLayout } from "./HarlyLayout";
import { EmailFallbackLink } from "./EmailFallbackLink";

export type ResetPasswordEmailProps = {
  userName: string;
  resetUrl: string;
};

export const resetPasswordSubject = "Reset your password";

export function ResetPasswordEmail({ userName, resetUrl }: ResetPasswordEmailProps) {
  return (
    <HarlyLayout
      preview="Reset your Harly password — this link expires in 1 hour."
      bodyClassName="mobile:px-6! px-10 pt-8 pb-8"
    >
      <Text className="text-[40px] leading-[1.05] tracking-[-1px] font-inter text-fg m-0 font-medium">
        Reset your password
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mt-[18px] mb-9">
        Someone requested a password reset for your Harly account. Use the button
        below to choose a new password.
      </Text>
      <Button
        href={resetUrl}
        className="bg-brand text-[14px] leading-[1.5] font-inter text-fg-inverted inline-block border-none px-4 py-2.5 text-center box-border no-underline"
      >
        Change password
      </Button>
      <EmailFallbackLink url={resetUrl} />
      <Text className="text-[11px] leading-[1.5] tracking-[-0.033px] font-inter text-fg-3 m-0 mt-8 max-w-[310px]">
        If you didn&apos;t request this, please ignore this email. Your password
        won&apos;t change until you access the link above and create a new one.
      </Text>
    </HarlyLayout>
  );
}

ResetPasswordEmail.PreviewProps = {
  userName: "Ava",
  resetUrl: "https://app.harly.dev/reset-password?token=abc123",
} satisfies ResetPasswordEmailProps;
