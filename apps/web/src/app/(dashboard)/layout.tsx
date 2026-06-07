import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getInboxCount } from "@/features/dashboard/widgets";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { listUserWorkspaceOptions } from "@/features/workspaces/data";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { organization, user, role } = await getWorkspaceContext();
  const [workspaceOptions, inboxCount] = await Promise.all([
    listUserWorkspaceOptions(),
    getInboxCount(),
  ]);

  const workspace = {
    id: organization.id,
    name: organization.name,
    logoUrl: organization.logo ?? null,
  };

  return (
    <SidebarProvider defaultOpen={false}>
      <AppSidebar
        workspace={workspace}
        workspaceOptions={workspaceOptions}
        inboxCount={inboxCount}
      />
      <SidebarInset>
        <div className="h-0.5 w-full bg-gradient-to-r from-primary/60 to-primary/10" />
        <TopBar
          user={{ name: user.name, email: user.email, image: user.image ?? null }}
          role={role}
          workspace={workspace}
          workspaceOptions={workspaceOptions}
        />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
