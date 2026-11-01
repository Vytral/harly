import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Route } from "next";

import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import { PortalShell } from "@/features/portal/PortalShellServer";
import { listCandidatePortalNotifications } from "@/features/portal/notification-data";
import { PortalNotificationsList } from "@/features/portal/PortalNotificationsList";

export const dynamic = "force-dynamic";

export default async function PortalNotificationsPage() {
  const token = (await cookies()).get(PORTAL_SESSION_COOKIE)?.value;
  if (!token) redirect("/portal/login" as Route);

  const session = await resolvePortalSession(token);
  if (!session) redirect("/portal/login" as Route);

  const notifications = await listCandidatePortalNotifications({
    workspaceId: session.workspaceId,
    candidateId: session.candidateId,
  });

  return (
    <PortalShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="pt-2">
          <h1 className="text-[28px] font-semibold tracking-tight text-near-ink">Updates</h1>
          <p className="mt-1 text-[15px] text-soft-ink">News about your applications and interviews.</p>
        </header>
        <PortalNotificationsList notifications={notifications} />
      </div>
    </PortalShell>
  );
}
