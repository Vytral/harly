import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import { getPendingInvitationForEmail } from "@/features/workspaces/data";
import { organizationExists } from "@/lib/self-host";
import { OnboardingSignOut } from "@/app/(onboarding)/onboarding/_components/OnboardingSignOut";

export const dynamic = "force-dynamic";

export default async function NoWorkspacePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const context = await getWorkspaceContextOrNull({
    fallbackToFirstOrganization: false,
  });
  if (context) redirect("/dashboard");
  if (!(await organizationExists())) redirect("/onboarding");

  // Check if user has a pending invitation — if so, redirect to accept it.
  const pendingInvitation = await getPendingInvitationForEmail(
    session.user.email,
  );
  if (pendingInvitation) {
    redirect(`/invite/${pendingInvitation.id}`);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-8 py-6">
        <Link href="/" className="font-display text-lg tracking-tight text-pine">
          Harly
        </Link>
        <OnboardingSignOut />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-20">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl bg-sage text-pine ring-1 ring-pine/10">
            <EnvelopeIcon className="size-7" />
          </div>

          <h1 className="font-display text-3xl tracking-tight text-foreground">
            You need an invitation
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            This Harly workspace is already set up. Ask an admin to invite{" "}
            <span className="font-medium text-foreground">
              {session.user.email}
            </span>{" "}
            — your invite link drops you straight into the right role.
          </p>

          <div className="mt-10 rounded-lg bg-muted px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Signed in as{" "}
              <span className="font-medium text-foreground">
                {session.user.email}
              </span>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

function EnvelopeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}
