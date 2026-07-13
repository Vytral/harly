import { cookies } from "next/headers";

import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { HarlyAIWidget } from "@/components/dashboard/HarlyAIWidget";
import { PageTitleProvider } from "@/components/dashboard/PageTitleContext";
import { StickyBarProvider } from "@/components/dashboard/StickyBarContext";
import { TopBar } from "@/components/dashboard/TopBar";
import { VerifyEmailBanner } from "@/components/VerifyEmailBanner";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { listNotifications } from "@/features/notifications/data";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { getWorkspaceAiStatus } from "@/lib/ai/config";
import { getCurrentPermissions } from "@/features/workspaces/permissions-server";
import {
  getSidebarBranding,
  listUserWorkspaceOptions,
} from "@/features/workspaces/data";
import { listWorkspaceRoles } from "@/features/workspaces/permissions-server";
import { getMyTasksDueCount } from "@/features/tasks/data";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  // Manual toggle persists via the sidebar_state cookie; default expanded.
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";

  const { organization, user, role } = await getWorkspaceContext();
  const [workspaceOptions, notifications, sidebarLogo, roles, userPermissions, aiStatus, taskDueCount] =
    await Promise.all([
      listUserWorkspaceOptions(),
      listNotifications(8),
      getSidebarBranding(organization.id),
      listWorkspaceRoles(),
      getCurrentPermissions(),
      getWorkspaceAiStatus(organization.id),
      getMyTasksDueCount(),
    ]);
  const inboxCount = notifications.filter((n) => !n.read).length;
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
          inboxCount={inboxCount}
          taskDueCount={taskDueCount}
          userPermissions={userPermissions}
          sidebarLogo={sidebarLogo}
          assignableRoles={assignableRoles}
        />
        <SidebarInset>
          <TopBar
            user={{ name: user.name, email: user.email, image: user.image ?? null }}
            role={role}
            workspace={workspace}
            workspaceOptions={workspaceOptions}
            notifications={notifications}
            userPermissions={userPermissions}
          />
          {!user.emailVerified ? <VerifyEmailBanner email={user.email} /> : null}
          <PageTitleProvider>
            <main className="w-full flex-1 px-4 pb-6 pt-2 md:px-6 lg:px-8 lg:pb-8 lg:pt-3">
              {children}
            </main>
          </PageTitleProvider>
        </SidebarInset>
        <HarlyAIWidget userName={user.name} aiEnabled={aiStatus.enabled && aiStatus.hasApiKey && aiStatus.encryptionReady} />
      </SidebarProvider>
    </StickyBarProvider>
  );
}
