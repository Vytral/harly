import { cookies } from "next/headers";

import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { PageTitleProvider } from "@/components/dashboard/PageTitleContext";
import { TopBar } from "@/components/dashboard/TopBar";
import { VerifyEmailBanner } from "@/components/VerifyEmailBanner";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { listNotifications } from "@/features/notifications/data";
import { getWorkspaceContext } from "@/features/workspaces/context";
import {
  getSidebarBranding,
  listUserWorkspaceOptions,
} from "@/features/workspaces/data";
import { getRolePermissions } from "@/features/workspaces/permissions-server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  // Manual toggle persists via the sidebar_state cookie; default expanded.
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";

  const { organization, user, role } = await getWorkspaceContext();
  const [workspaceOptions, notifications, userPermissions, sidebarLogo] =
    await Promise.all([
      listUserWorkspaceOptions(),
      listNotifications(8),
      getRolePermissions(organization.id, role),
      getSidebarBranding(organization.id),
    ]);
  const inboxCount = notifications.filter((n) => !n.read).length;

  const workspace = {
    id: organization.id,
    name: organization.name,
    logoUrl: organization.logo ?? null,
  };

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar
        workspace={workspace}
        inboxCount={inboxCount}
        userPermissions={userPermissions}
        sidebarLogo={sidebarLogo}
      />
      <SidebarInset>
        <div className="h-0.5 w-full bg-gradient-to-r from-primary/60 to-primary/10" />
        <TopBar
          user={{ name: user.name, email: user.email, image: user.image ?? null }}
          role={role}
          workspace={workspace}
          workspaceOptions={workspaceOptions}
          notifications={notifications}
        />
        {!user.emailVerified ? <VerifyEmailBanner email={user.email} /> : null}
        <PageTitleProvider>
          <main className="w-full flex-1 px-4 py-6 md:px-6 lg:px-8 lg:py-8">
            {children}
          </main>
        </PageTitleProvider>
      </SidebarInset>
    </SidebarProvider>
  );
}
