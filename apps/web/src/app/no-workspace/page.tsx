import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import { organizationExists } from "@/lib/self-host";
import { EnvelopeIcon } from "@/components/ui/icons/settings";
import { OnboardingSignOut } from "@/app/(onboarding)/onboarding/_components/OnboardingSignOut";

export const dynamic = "force-dynamic";

export default async function NoWorkspacePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  // If they actually belong to the workspace, send them in. If no org exists at
  // all, they're the bootstrap owner — send them to create it.
  const context = await getWorkspaceContextOrNull({
    fallbackToFirstOrganization: false,
  });
  if (context) redirect("/dashboard");
  if (!(await organizationExists())) redirect("/onboarding");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
        <span className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl bg-sage text-pine ring-1 ring-pine/10">
          <EnvelopeIcon className="size-7" />
        </span>
        <h1 className="font-display text-2xl tracking-tight text-foreground">
          You need an invitation
        </h1>
        <p className="mt-3 text-pretty text-sm leading-6 text-muted-foreground">
          This Harly workspace is already set up. Ask an admin to invite{" "}
          <span className="font-medium text-foreground">{session.user.email}</span>{" "}
          — your invite link drops you straight into the right role.
        </p>

        <div className="mt-8 flex items-center justify-center gap-4 border-t border-border pt-6">
          <p className="text-xs text-muted-foreground">
            Signed in as {session.user.email}
          </p>
          <OnboardingSignOut />
        </div>
      </section>
    </main>
  );
}
