import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import type { Route } from "next";

import { db, organization, candidates, workspaceSettings } from "@harly/db";
import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import { signOutPortalAction } from "@/features/portal/actions";
import { PortalShellClient } from "@/features/portal/PortalShell";
import { SignOutIcon } from "@/components/ui/icons/phosphor";

function getInitials(first: string, last: string): string {
  return ((first.charAt(0) || "") + (last.charAt(0) || "")).toUpperCase() || "?";
}

export async function PortalShell({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
  if (!token) redirect("/portal/login" as Route);

  const session = await resolvePortalSession(token);
  if (!session) redirect("/portal/login" as Route);

  const [org] = await db
    .select({
      name: organization.name,
      logo: organization.logo,
      primaryColor: workspaceSettings.primaryColor,
      fullLogoUrl: workspaceSettings.sidebarLogoUrl,
      fullLogoDarkUrl: workspaceSettings.sidebarLogoDarkUrl,
    })
    .from(organization)
    .leftJoin(workspaceSettings, eq(workspaceSettings.organizationId, organization.id))
    .where(eq(organization.id, session.workspaceId))
    .limit(1);

  const [candidate] = await db
    .select({ avatarUrl: candidates.avatarUrl })
    .from(candidates)
    .where(eq(candidates.id, session.candidateId))
    .limit(1);

  return (
    <PortalShellClient
      orgName={org?.name ?? "Careers"}
      orgLogo={org?.logo ?? null}
      orgFullLogoUrl={org?.fullLogoUrl ?? null}
      orgFullLogoDarkUrl={org?.fullLogoDarkUrl ?? null}
      orgColor={org?.primaryColor ?? null}
      candidateName={`${session.firstName} ${session.lastName}`.trim()}
      candidateInitials={getInitials(session.firstName, session.lastName)}
      candidateAvatarUrl={candidate?.avatarUrl ?? null}
      signOutForm={
        <form action={signOutPortalAction} className="w-full">
          <button
            type="submit"
            className="flex w-full items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <SignOutIcon className="size-4" />
            Sign out
          </button>
        </form>
      }
    >
      {children}
    </PortalShellClient>
  );
}
