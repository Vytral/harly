"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Check,
  ChevronsUpDown,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  UserPlus,
} from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import {
  CreateOrganizationDialog,
  WorkspaceMark,
} from "@/components/dashboard/WorkspaceSwitcher";
import {
  isNavActive,
  primaryNav,
  workspaceNav,
  type NavItem,
} from "@/components/dashboard/nav-items";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import type { WorkspaceOption } from "@/features/workspaces/data";

type AppSidebarProps = {
  workspace: { id: string; name: string; logoUrl: string | null };
  workspaceOptions: WorkspaceOption[];
  inboxCount: number;
};

export function AppSidebar({
  workspace,
  workspaceOptions,
  inboxCount,
}: AppSidebarProps) {
  const pathname = usePathname();
  const { open } = useSidebar();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarBrand workspace={workspace} workspaceOptions={workspaceOptions} />
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
          <SidebarGroupLabel
            className={cn(!open && "justify-center px-0")}
            data-dash={!open ? "" : undefined}
          >
            {open ? "Workspace" : "—"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {workspaceNav.map((item) => (
                <NavMenuItem key={item.href} item={item} pathname={pathname} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

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
 * switcher.
 */
function SidebarBrand({
  workspace,
  workspaceOptions,
}: {
  workspace: { id: string; name: string; logoUrl: string | null };
  workspaceOptions: WorkspaceOption[];
}) {
  const { open, toggleSidebar } = useSidebar();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);

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

  return (
    <>
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
            onClick={toggleSidebar}
            aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
            title={open ? "Collapse sidebar" : "Expand sidebar"}
            className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-lg border border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground opacity-0 transition-opacity duration-150 hover:border-sidebar-ring/40 hover:text-sidebar-foreground group-hover/logo:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            {open ? (
              <PanelLeftClose className="size-5" strokeWidth={1.8} />
            ) : (
              <PanelLeftOpen className="size-5" strokeWidth={1.8} />
            )}
          </button>
        </div>

        {open ? (
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
          </DropdownMenu>
        ) : null}
      </div>

      <CreateOrganizationDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
