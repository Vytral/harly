import { cookies } from "next/headers";

import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { HarlyAIWidget } from "@/components/dashboard/HarlyAIWidget";
import { PageTitleProvider } from "@/components/dashboard/PageTitleContext";
import { StickyBarProvider } from "@/components/dashboard/StickyBarContext";
import { TopBar } from "@/components/dashboard/TopBar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
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

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  // Manual toggle persists via the sidebar_state cookie; first visit is compact.
  const sidebarOpen = cookieStore.get("sidebar_state")?.value === "true";

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
    <StickyBarProvider>
      <SidebarProvider defaultOpen={sidebarOpen}>
        <AppSidebar
          workspace={workspace}
          inboxCount={unreadInboxThreadCount}
          taskDueCount={taskDueCount}
          userPermissions={userPermissions}
          sidebarLogo={sidebarLogo}
          assignableRoles={assignableRoles}
        />
        <SidebarInset>
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
          />
          <PageTitleProvider>
            <main className="min-h-0 w-full flex-1 overflow-y-auto px-4 pb-6 pt-2 md:px-6 lg:px-8 lg:pb-8 lg:pt-3">
              {children}
            </main>
          </PageTitleProvider>
        </SidebarInset>
        <HarlyAIWidget
          userName={user.name}
          userId={user.id}
          workspaceId={organization.id}
          aiEnabled={
            aiStatus.enabled && aiStatus.hasApiKey && aiStatus.encryptionReady
          }
        />
      </SidebarProvider>
    </StickyBarProvider>
  );
}
