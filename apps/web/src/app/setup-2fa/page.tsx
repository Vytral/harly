import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db, member as authMembers, organization, passkeys } from "@harly/db";
import { Setup2FAForm } from "./_components/setup-2fa-form";

export const dynamic = "force-dynamic";

export default async function Setup2FAPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/login?redirect=/setup-2fa");
  }

  const twoFactorEnabled =
    "twoFactorEnabled" in session.user &&
    typeof session.user.twoFactorEnabled === "boolean"
      ? session.user.twoFactorEnabled
      : false;

  // A passkey is a valid second factor too, not just TOTP.
  const [existingPasskey] = await db
    .select({ id: passkeys.id })
    .from(passkeys)
    .where(eq(passkeys.userId, session.user.id))
    .limit(1);

  // Already has 2FA , send to dashboard.
  if (twoFactorEnabled || existingPasskey) {
    redirect("/dashboard");
  }

  // Fetch workspace logo for display
  const [membership] = await db
    .select({ logo: organization.logo, name: organization.name })
    .from(authMembers)
    .innerJoin(organization, eq(organization.id, authMembers.organizationId))
    .where(eq(authMembers.userId, session.user.id))
    .limit(1);

  return (
    <div className="relative min-h-screen overflow-hidden bg-paper text-foreground antialiased">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-40 left-1/2 h-[480px] w-[760px] -translate-x-1/2 rounded-full bg-sage opacity-50 blur-3xl" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="flex items-center justify-between px-8 py-6">
          <Link
            href="/"
            className="font-display text-lg tracking-tight text-pine"
          >
            Harly
          </Link>
        </header>

        <main className="flex flex-1 flex-col items-center justify-center px-6 pb-20">
          <div className="w-full max-w-sm">
            {membership?.logo && (
              <div className="mb-6 flex justify-center">
                <Image
                  src={membership.logo}
                  alt={membership.name ?? "Workspace"}
                  width={56}
                  height={56}
                  className="h-14 w-14 rounded-xl object-cover"
                  unoptimized
                />
              </div>
            )}
            <p className="text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-pine">
              Security required
            </p>
            <h1 className="mt-3 text-center font-display text-3xl tracking-tight text-foreground">
              Set up two-factor authentication
            </h1>
            <p className="mt-2 text-center text-sm leading-6 text-muted-foreground">
              Your workspace requires 2FA. Set it up below to continue to the
              dashboard.
            </p>

            <div className="mt-10">
              <Setup2FAForm />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
