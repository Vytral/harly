import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db, user as userTable } from "@harly/db";
import { ChangePasswordForm } from "./_components/change-password-form";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login?redirect=/change-password");
  }

  const [userRow] = await db
    .select({ mustChangePassword: userTable.mustChangePassword })
    .from(userTable)
    .where(eq(userTable.id, session.user.id))
    .limit(1);

  // Only reachable while a forced change is pending.
  if (!userRow?.mustChangePassword) {
    redirect("/dashboard");
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-paper text-foreground antialiased">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-40 left-1/2 h-[480px] w-[760px] -translate-x-1/2 rounded-full bg-sage opacity-50 blur-3xl" />
      </div>

      <main className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 pb-20">
        <div className="w-full max-w-sm">
          <p className="text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-pine">
            Action required
          </p>
          <h1 className="mt-3 text-center font-display text-3xl tracking-tight text-foreground">
            Choose a new password
          </h1>
          <p className="mt-2 text-center text-sm leading-6 text-muted-foreground">
            Your account was set up with a temporary password. Pick a new one to
            continue.
          </p>

          <div className="mt-10">
            <ChangePasswordForm />
          </div>
        </div>
      </main>
    </div>
  );
}
