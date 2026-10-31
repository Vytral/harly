import type { Route } from "next";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { HarlyAIProvider } from "@/components/dashboard/HarlyAIWidget";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { PageTitleProvider } from "@/components/dashboard/PageTitleContext";
import { StickyBarProvider } from "@/components/dashboard/StickyBarContext";
import { ShellPageHeading } from "@/components/dashboard/ShellPageHeading";
import {
  getUnreadNotificationCount,
  listNotifications,
} from "@/features/notifications/data";
import { getUnreadInboxThreadCount } from "@/features/mailbox/data";
import { isDemoMode } from "@harly/config";

import { isLiveSandboxWorkspace } from "@/features/demo/sandbox-access";

import { getWorkspaceContext } from "@/features/workspaces/context";
import { getWorkspaceAiStatus } from "@/lib/ai/config";
import { getClientAssistantBranding } from "@/lib/ai/assistant-branding";
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
  const demo = isDemoMode();
  if (demo && !(await isLiveSandboxWorkspace(organization.id))) {
    // Demo visitors only ever work inside their own sandbox. A session pointing
    // at the shared template (an old shared-account cookie) or at an expired
    // sandbox is sent back to mint a fresh one.
    redirect("/enter" as Route);
  }
  const [
    workspaceOptions,
    notifications,
    unreadNotificationCount,
    unreadInboxThreadCount,
    sidebarLogo,
    roles,
    userPermissions,
    aiStatus,
    assistantBranding,
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
    getClientAssistantBranding(organization.id),
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
          canConfigureAi={userPermissions.includes("settings:edit") && !demo}
          assistant={assistantBranding}
        >
          {/*
          Deel-style shell: a sticky lime-washed header (switcher, pill tabs,
          round actions, sub-nav) over a warm-paper canvas. The page scrolls
          with the document and the content sits in one centred column.
        */}
          <div className="min-h-dvh w-full shell-glow">
            <a
              href="#main-content"
              className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-[var(--radius-btn)] focus-visible:bg-near-ink focus-visible:px-3 focus-visible:py-2 focus-visible:text-sm focus-visible:text-pure-snow"
            >
              Skip to content
            </a>
            <AppHeader
              user={{
                name: user.name,
                email: user.email,
                image: user.image ?? null,
                username: ownProfile?.username ?? null,
              }}
              role={role}
              workspace={workspace}
              // Demo: one shared account is a member of the pool workspace(s);
              // hide the switcher so a visitor can't hop into another one.
              workspaceOptions={demo ? [] : workspaceOptions}
              notifications={notifications}
              unreadNotificationCount={unreadNotificationCount}
              userPermissions={userPermissions}
              inboxCount={unreadInboxThreadCount}
              taskDueCount={taskDueCount}
              sidebarLogo={sidebarLogo}
              assignableRoles={assignableRoles}
              demoMode={demo}
            />
            <PageTitleProvider>
              <main
                id="main-content"
                tabIndex={-1}
                className="mx-auto w-full max-w-[1280px] px-4 pb-12 pt-6 outline-none md:px-6"
              >
                <ShellPageHeading />
                {children}
              </main>
            </PageTitleProvider>
          </div>
        </HarlyAIProvider>
      </StickyBarProvider>
    </RealtimeProvider>
  );
}
