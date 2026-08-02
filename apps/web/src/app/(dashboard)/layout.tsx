import type { Metadata } from "next";

import { HarlyAIProvider } from "@/components/dashboard/HarlyAIWidget";
import { IconRail } from "@/components/dashboard/IconRail";
import { PageTitleProvider } from "@/components/dashboard/PageTitleContext";
import { StickyBarProvider } from "@/components/dashboard/StickyBarContext";
import { TopBar } from "@/components/dashboard/TopBar";
import {
  getUnreadNotificationCount,
  listNotifications,
} from "@/features/notifications/data";
import { getUnreadInboxThreadCount } from "@/features/mailbox/data";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { getWorkspaceAiStatus } from "@/lib/ai/config";
import { getCurrentPermissions } from "@/features/workspaces/permissions-server";
import {
  getSidebarBranding,
  listUserWorkspaceOptions,
} from "@/features/workspaces/data";
import { listWorkspaceRoles } from "@/features/workspaces/permissions-server";
import { getMyTasksDueCount } from "@/features/tasks/data";
import { getOwnProfileAction } from "@/features/people/actions";
import { RealtimeProvider } from "@/components/dashboard/RealtimeProvider";
import { RealtimePageSync } from "@/components/dashboard/RealtimePageSync";

export async function generateMetadata(): Promise<Metadata> {
  const { organization } = await getWorkspaceContext();
  return {
    icons: {
      icon: organization.logo ?? "/favicon.svg",
    },
  };
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { organization, user, role } = await getWorkspaceContext();
  const [
    workspaceOptions,
    notifications,
    unreadNotificationCount,
    unreadInboxThreadCount,
    sidebarLogo,
    roles,
    userPermissions,
    aiStatus,
    taskDueCount,
    ownProfile,
  ] = await Promise.all([
    listUserWorkspaceOptions(),
    listNotifications(8),
    getUnreadNotificationCount(),
    getUnreadInboxThreadCount(),
    getSidebarBranding(organization.id),
    listWorkspaceRoles(),
    getCurrentPermissions(),
    getWorkspaceAiStatus(organization.id),
    getMyTasksDueCount(),
    getOwnProfileAction(),
  ]);
  const assignableRoles = roles.map((r) => ({ key: r.key, name: r.name }));

  const workspace = {
    id: organization.id,
    name: organization.name,
    logoUrl: organization.logo ?? null,
  };

  return (
    <RealtimeProvider>
      <RealtimePageSync />
      <StickyBarProvider>
        <HarlyAIProvider
          userName={user.name}
          userId={user.id}
          workspaceId={organization.id}
          aiEnabled={
            aiStatus.enabled && aiStatus.hasApiKey && aiStatus.encryptionReady
          }
        >
          {/*
          The shell from frame 01: a warm-paper viewport with the icon rail flat
          on the canvas, and the work sitting inside one rounded snow stage. Not
          a pile of cards , a single calm window. The outer radius only appears
          from md up, where there is room for the paper margin to read.
        */}
          <div className="flex h-dvh w-full overflow-hidden bg-warm-paper">
            <IconRail
              workspace={workspace}
              inboxCount={unreadInboxThreadCount}
              taskDueCount={taskDueCount}
              userPermissions={userPermissions}
              sidebarLogo={sidebarLogo}
              assignableRoles={assignableRoles}
            />
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-pure-snow md:my-2 md:mr-2 md:rounded-[var(--radius-shell)] md:border md:border-hairline">
              <TopBar
                user={{
                  name: user.name,
                  email: user.email,
                  image: user.image ?? null,
                  username: ownProfile?.username ?? null,
                }}
                role={role}
                workspace={workspace}
                workspaceOptions={workspaceOptions}
                notifications={notifications}
                unreadNotificationCount={unreadNotificationCount}
                userPermissions={userPermissions}
                inboxCount={unreadInboxThreadCount}
                taskDueCount={taskDueCount}
              />
              <PageTitleProvider>
                <main className="min-h-0 w-full flex-1 overflow-y-auto px-4 pb-8 pt-2 md:px-7">
                  {children}
                </main>
              </PageTitleProvider>
            </div>
          </div>
        </HarlyAIProvider>
      </StickyBarProvider>
    </RealtimeProvider>
  );
}
