import Link from "next/link";

import { getAuthBranding } from "@/features/auth/branding.server";
import { AuthShell, AuthCard } from "../_components/auth-shell";
import { ForgotPasswordForm } from "./_components/forgot-password-form";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const branding = await getAuthBranding();

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
        subtitle="Enter your email and we'll send you a link to reset it."
        footer={
          <>
            Remembered it?{" "}
            <Link href="/login" className="font-semibold text-foreground hover:underline">
              Sign in
            </Link>
          </>
        }
      >
        <ForgotPasswordForm />
      </AuthCard>
    </AuthShell>
  );
}
