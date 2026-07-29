import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import type { Route } from "next";

import { db, organization, candidates, workspaceSettings } from "@harly/db";
import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import { PortalShellClient } from "@/features/portal/PortalShell";
import { PortalSignOutButton } from "@/features/portal/PortalSignOutButton";
import { getCandidatePortalUnreadNotificationCount } from "@/features/portal/notification-data";
import { normalizeCareerPageConfig } from "@/features/career-page/config";

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
      careerPageConfig: workspaceSettings.careerPageConfig,
    })
    .from(organization)
    .leftJoin(workspaceSettings, eq(workspaceSettings.organizationId, organization.id))
    .where(eq(organization.id, session.workspaceId))
    .limit(1);

  const [[candidate], unreadNotificationCount] = await Promise.all([
    db
      .select({ avatarUrl: candidates.avatarUrl })
      .from(candidates)
      .where(
        and(
          eq(candidates.id, session.candidateId),
          eq(candidates.workspaceId, session.workspaceId),
          isNull(candidates.deletedAt),
        ),
      )
      .limit(1),
    getCandidatePortalUnreadNotificationCount({
      workspaceId: session.workspaceId,
      candidateId: session.candidateId,
    }),
  ]);

  const careerConfig = normalizeCareerPageConfig(org?.careerPageConfig);

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
      unreadNotificationCount={unreadNotificationCount}
      signOutForm={<PortalSignOutButton />}
      socials={careerConfig.footer.socials}
      legalLinks={careerConfig.footer.legalLinks}
      year={new Date().getFullYear()}
    >
      {children}
    </PortalShellClient>
  );
}
