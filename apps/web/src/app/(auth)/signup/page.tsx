import Link from "next/link";

import { getAvailableLoginMethods } from "@/features/auth/login-methods.server";
import { getAuthBranding } from "@/features/auth/branding.server";
import { organizationExists } from "@/lib/self-host";
import { AuthShell, AuthCard } from "../_components/auth-shell";
import { SignupForm } from "./_components/signup-form";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  // Self-host model: one workspace per deployment. The first account
  // bootstraps it; afterwards signups are invite-only (enforced in
  // enforceInviteOnly). Anyone landing here directly gets the message
  // instead of a form that can only fail.
  const [methods, branding, inviteOnly] = await Promise.all([
    getAvailableLoginMethods(),
    getAuthBranding(),
    organizationExists(),
  ]);
  const googleEnabled = methods.social.includes("google");

  return (
    <AuthShell
      branding={branding}
      rightSlot={
        <Link
          href="/login"
          className="font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Sign in
        </Link>
      }
    >
      <AuthCard
        title="Create your account"
        subtitle="Set up your ATS in minutes. No credit card required."
        footer={
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-foreground hover:underline">
              Sign in
            </Link>
          </>
        }
      >
        {inviteOnly ? (
          <div className="rounded-lg bg-muted px-4 py-3">
            <p className="text-sm font-medium text-foreground">
              Signups are invite-only.
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              This Harly workspace is already set up. Ask an admin to
              invite you — your invite link drops you straight into the
              right role.
            </p>
          </div>
        ) : (
          <SignupForm googleEnabled={googleEnabled} />
        )}
      </AuthCard>
    </AuthShell>
  );
}
