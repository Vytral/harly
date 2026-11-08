import Link from "next/link";

import { getAuthBranding } from "@/features/auth/branding.server";
import { isStaffEmailDeliveryConfigured } from "@/features/auth/login-methods.server";
import { AuthShell, AuthCard } from "../_components/auth-shell";
import { ForgotPasswordForm } from "./_components/forgot-password-form";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const [branding, emailConfigured] = await Promise.all([
    getAuthBranding(),
    isStaffEmailDeliveryConfigured(),
  ]);

  return (
    <AuthShell
      branding={branding}
      rightSlot={
        <Link
          href="/login"
          className="font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Back to sign in
        </Link>
      }
    >
      <AuthCard
        title="Forgot password"
        subtitle={
          emailConfigured
            ? "Enter your email and we'll send you a link to reset it."
            : "Password reset by email is not available on this instance."
        }
        footer={
          <>
            Remembered it?{" "}
            <Link href="/login" className="font-semibold text-foreground hover:underline">
              Sign in
            </Link>
          </>
        }
      >
        {emailConfigured ? (
          <ForgotPasswordForm />
        ) : (
          <p role="status" className="text-sm leading-6 text-muted-foreground">
            This workspace has no email delivery configured, so Harly cannot
            send a reset link. Sign in with another method (single sign-on or a
            passkey), or ask a workspace administrator to set a new password for you from the members settings.
          </p>
        )}
      </AuthCard>
    </AuthShell>
  );
}
