import Link from "next/link";

import { getAuthBranding } from "@/features/auth/branding.server";
import { AuthShell, AuthCard } from "../_components/auth-shell";
import { ResetPasswordForm } from "./_components/reset-password-form";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const [{ token, error }, branding] = await Promise.all([
    searchParams,
    getAuthBranding(),
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
        title="Reset password"
        subtitle="Choose a new password for your account."
      >
        <ResetPasswordForm token={token ?? null} tokenError={error ?? null} />
      </AuthCard>
    </AuthShell>
  );
}
