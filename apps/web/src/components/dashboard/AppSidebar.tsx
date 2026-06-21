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
  useSidebar,
} from "@/components/ui/sidebar";
import type { SidebarBranding } from "@/features/workspaces/data";
import type { Permission } from "@/features/workspaces/permissions";

type AppSidebarProps = {
  workspace: { id: string; name: string; logoUrl: string | null };
  inboxCount: number;
  userPermissions: Permission[];
  sidebarLogo: SidebarBranding;
};

export function AppSidebar({
  workspace,
  inboxCount,
  userPermissions,
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
        <SidebarBrand workspace={workspace} sidebarLogo={sidebarLogo} />
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
            <div
              aria-hidden
              className="mx-auto my-1 h-px w-6 rounded-full bg-sidebar-border"
            />
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

      {canInvite ? (
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Invite team">
                <Link href="/settings/members">
                  <UserPlusIcon />
                  <span>Invite team</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      ) : null}
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
 * Header row. Two shapes:
 *  - "Full logo": a wide wordmark (light/dark) linking Home, with a visible
 *    bordered collapse button beside it.
 *  - Default: a square icon mark that swaps to a bordered collapse/expand
 *    toggle on hover, plus the workspace name as a Home link when expanded.
 *
 * Switching and creating workspaces live in the top-bar account menu, so the
 * sidebar shows no switcher — the name is just a link Home.
 */
function SidebarBrand({
  workspace,
  sidebarLogo,
}: {
  workspace: { id: string; name: string; logoUrl: string | null };
  sidebarLogo: SidebarBranding;
}) {
  const { open, toggleSidebar } = useSidebar();

  const showWordmark =
    open && sidebarLogo.style === "full" && !!sidebarLogo.lightUrl;

  const toggleButtonClass =
    "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-sidebar-border bg-sidebar-accent/40 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring";

  if (showWordmark) {
    return (
      <div className="flex h-10 items-center gap-2 px-1">
        <Link
          href="/dashboard"
          aria-label={`${workspace.name} — go to dashboard`}
          className="flex min-w-0 flex-1 items-center rounded-md px-1.5 py-1 transition-colors hover:bg-sidebar-accent"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={sidebarLogo.lightUrl ?? undefined}
            alt={workspace.name}
            className={cn(
              "h-7 max-w-[150px] object-contain object-left",
              sidebarLogo.darkUrl && "dark:hidden",
            )}
          />
          {sidebarLogo.darkUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={sidebarLogo.darkUrl}
              alt={workspace.name}
              className="hidden h-7 max-w-[150px] object-contain object-left dark:block"
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
          className={toggleButtonClass}
        >
          <CaretLineLeftIcon className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-10 items-center gap-2.5 px-1",
        !open && "justify-center px-0",
      )}
    >
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
          className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-lg border border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground opacity-0 transition-opacity duration-150 hover:border-sidebar-ring/40 hover:text-sidebar-foreground group-hover/logo:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          {open ? (
            <CaretLineLeftIcon className="size-4" />
          ) : (
            <CaretLineRightIcon className="size-4" />
          )}
        </button>
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
