"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { WorkspaceMark } from "@/components/dashboard/WorkspaceSwitcher";
import {
  isNavActive,
  primaryNav,
  workspaceNav,
  type NavItem,
} from "@/components/dashboard/nav-items";
import {
  CaretLineLeftIcon,
  CaretLineRightIcon,
  UserPlusIcon,
} from "@/components/ui/icons/phosphor";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import type {
  SidebarBranding,
  WorkspaceOption,
} from "@/features/workspaces/data";
import type { WorkspaceRole } from "@/features/workspaces/roles";

type AppSidebarProps = {
  workspace: { id: string; name: string; logoUrl: string | null };
  inboxCount: number;
  role: WorkspaceRole;
  sidebarLogo: SidebarBranding;
};

export function AppSidebar({
  workspace,
  inboxCount,
  role,
  sidebarLogo,
}: AppSidebarProps) {
  const pathname = usePathname();
  const { open } = useSidebar();

  const visibleWorkspaceNav = workspaceNav.filter(
    (item) =>
      !item.requiredPermission ||
      userPermissions.includes(item.requiredPermission),
  );

  const canInvite = userPermissions.includes("members:manage");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
         <SidebarBrand
          workspace={workspace}
          workspaceOptions={workspaceOptions}
          role={role}
          sidebarLogo={sidebarLogo}
        />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {primaryNav.map((item) => (
                <NavMenuItem
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  badge={
                    item.badge === "inbox" && inboxCount > 0
                      ? inboxCount
                      : undefined
                  }
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          {open ? (
            <SidebarGroupLabel>Workspace</SidebarGroupLabel> 
          ) : (
            <SidebarSeparator className="mx-2 my-1" />
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleWorkspaceNav.map((item) => (
                <NavMenuItem key={item.href} item={item} pathname={pathname} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator className="mx-2" />

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Invite team">
              <Link href="/settings/members">
                <UserPlus strokeWidth={1.8} />
                <span>Invite team</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function NavMenuItem({
  item,
  pathname,
  badge,
}: {
  item: NavItem;
  pathname: string;
  badge?: number;
}) {
  const active = isNavActive(pathname, item);
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
        <Link href={item.href} aria-current={active ? "page" : undefined}>
          <Icon strokeWidth={1.8} />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
      {badge ? <SidebarMenuBadge>{badge}</SidebarMenuBadge> : null}
    </SidebarMenuItem>
  );
}

/**
 * Header row: workspace logo + name. Hovering the logo swaps it for the
 * collapse/expand toggle; the name (when expanded) opens the workspace
 * switcher — unless the viewer can't switch (single workspace, or not an
 * owner/admin), in which case the row links straight to Home. Workspaces
 * with a "Full logo" sidebar style show their wordmark instead of the name.
 */
function SidebarBrand({
  workspace,
  workspaceOptions,
  role,
  sidebarLogo,
}: {
  workspace: { id: string; name: string; logoUrl: string | null };
  workspaceOptions: WorkspaceOption[];
  role: WorkspaceRole;
  sidebarLogo: SidebarBranding;
}) {
  const { open, toggleSidebar } = useSidebar();

  const canSwitch =
    (role === "owner" || role === "admin") && workspaceOptions.length > 1;
  // Show the extended wordmark only when expanded, the style is "full", and a
  // light asset exists. Collapsed always falls back to the square icon mark so
  // the rail stays a single, consistent logo.
  const showWordmark =
    open && sidebarLogo.style === "full" && !!sidebarLogo.lightUrl;

  function switchTo(organizationId: string) {
    if (organizationId === workspace.id) return;
    startTransition(async () => {
      const result = await authClient.organization.setActive({ organizationId });
      if (!result.error) {
        router.replace("/dashboard");
        router.refresh();
      }
    });
  }

  const switcherContent = (
    <DropdownMenuContent align="start" className="min-w-60">
      <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/60">
        Workspaces
      </DropdownMenuLabel>
      {workspaceOptions.map((ws) => (
        <DropdownMenuItem
          key={ws.authOrganizationId}
          onClick={() => switchTo(ws.authOrganizationId)}
          className="gap-2.5"
        >
          <WorkspaceMark
            name={ws.name}
            logoUrl={ws.logoUrl}
            className="size-7"
          />
          <span className="flex-1 truncate">{ws.name}</span>
          <Check
            className={cn(
              "size-4 shrink-0 text-primary",
              ws.isActive ? "opacity-100" : "opacity-0",
            )}
          />
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={() => setCreateOpen(true)}
        className="gap-2.5 text-muted-foreground"
      >
        <span className="flex size-7 items-center justify-center rounded-lg border border-dashed">
          <Plus className="size-3.5" />
        </span>
        New workspace
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  return (
    <>
      <div
        className={cn(
          "flex h-10 items-center gap-2.5 px-1",
          !open && "justify-center px-0",
        )}
      >
        {showWordmark ? (
          <>
            {/* Single unified wordmark → Home (switching lives in the topbar) */}
            <Link
              href="/dashboard"
              aria-label={`${workspace.name} — go to dashboard`}
              className="flex min-w-0 flex-1 items-center rounded-md px-1.5 py-2 transition-colors hover:bg-sidebar-accent"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sidebarLogo.lightUrl ?? undefined}
                alt={workspace.name}
                className={cn(
                  "h-7 max-w-[156px] object-contain object-left",
                  sidebarLogo.darkUrl && "dark:hidden",
                )}
              />
              {sidebarLogo.darkUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={sidebarLogo.darkUrl ?? undefined}
                  alt={workspace.name}
                  className="hidden h-7 max-w-[156px] object-contain object-left dark:block"
                />
              ) : null}
            </Link>
            <button
              type="button"
              onClick={(event) => {
                toggleSidebar();
                event.currentTarget.blur();
              }}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-sidebar-border bg-sidebar-accent/40 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              <PanelLeftClose className="size-5" strokeWidth={1.8} />
            </button>
          </>
        ) : (
          <>
            {/* Logo ⇄ collapse toggle on hover */}
            <div className="group/logo relative size-9 shrink-0">
              <WorkspaceMark
                name={workspace.name}
                logoUrl={workspace.logoUrl}
                className="size-9 transition-opacity duration-150 group-hover/logo:opacity-0 group-focus-within/logo:opacity-0"
                priority
              />
              <button
                type="button"
                onClick={(event) => {
                  toggleSidebar();
                  event.currentTarget.blur();
                }}
                aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
                title={open ? "Collapse sidebar" : "Expand sidebar"}
                className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-md border border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground opacity-0 transition-opacity duration-150 hover:border-sidebar-ring/40 hover:text-sidebar-foreground group-hover/logo:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                {open ? (
                  <PanelLeftClose className="size-5" strokeWidth={1.8} />
                ) : (
                   <PanelLeftOpen className="size-5" strokeWidth={1.8} />
                )}
              </button>
            </div>
            {open ? (
              canSwitch ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-1.5 py-2 text-left transition-colors hover:bg-sidebar-accent"
                    >
                      <span className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold tracking-tight">
                        {workspace.name}
                      </span>
                      {isPending ? (
                        <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                      ) : (
                        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground/70" />
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  {switcherContent}
                </DropdownMenu>
              ) : (
                <Link
                  href="/dashboard"
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-2 text-left transition-colors hover:bg-sidebar-accent"
                >
                  <span className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold tracking-tight">
                    {workspace.name}
                  </span>
                </Link>
              )
            ) : null}
          </>
        )}
      </div>

      {open ? (
        <Link
          href="/dashboard"
          className="flex min-w-0 flex-1 items-center rounded-lg px-1.5 py-2 text-left transition-colors hover:bg-sidebar-accent"
        >
          <span className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold tracking-tight">
            {workspace.name}
          </span>
        </Link>
      ) : null}
    </div>
  );
}
