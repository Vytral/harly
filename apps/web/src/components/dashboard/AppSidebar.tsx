"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Loader2, Plus, UserPlus } from "lucide-react";

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

const EXPAND_DELAY = 80;
const COLLAPSE_DELAY = 140;

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
  const { setOpen, open } = useSidebar();
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveredRef = useRef(false);
  const dropdownOpenRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (collapseTimer.current !== null) {
      clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }
  }, []);

  const startCollapse = useCallback(() => {
    clearTimer();
    collapseTimer.current = setTimeout(() => {
      setOpen(false);
    }, COLLAPSE_DELAY);
  }, [clearTimer, setOpen]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const handleMouseEnter = useCallback(() => {
    isHoveredRef.current = true;
    clearTimer();
    collapseTimer.current = setTimeout(() => {
      setOpen(true);
    }, EXPAND_DELAY);
  }, [clearTimer, setOpen]);

  const handleMouseLeave = useCallback(() => {
    isHoveredRef.current = false;
    if (dropdownOpenRef.current) return;
    startCollapse();
  }, [startCollapse]);

  const handleDropdownOpenChange = useCallback(
    (open: boolean) => {
      dropdownOpenRef.current = open;
      if (!open && !isHoveredRef.current) {
        startCollapse();
      }
    },
    [startCollapse],
  );

  return (
    <Sidebar
      collapsible="icon"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <SidebarHeader>
        <WorkspaceSwitcher
          workspace={workspace}
          workspaceOptions={workspaceOptions}
          onDropdownOpenChange={handleDropdownOpenChange}
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
          <SidebarGroupLabel className={cn(!open && "justify-center px-0")} data-dash={!open ? "" : undefined}>{open ? "Workspace" : "\u2014"}</SidebarGroupLabel>
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

function WorkspaceSwitcher({
  workspace,
  workspaceOptions,
  onDropdownOpenChange,
}: {
  workspace: { id: string; name: string; logoUrl: string | null };
  workspaceOptions: WorkspaceOption[];
  onDropdownOpenChange: (open: boolean) => void;
}) {
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
      <DropdownMenu onOpenChange={onDropdownOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-sidebar-accent"
          >
            <WorkspaceMark
              name={workspace.name}
              logoUrl={workspace.logoUrl}
              className="size-8 shrink-0"
              priority
            />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
              {workspace.name}
            </span>
            {isPending ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground/70" />
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
              <WorkspaceMark name={ws.name} logoUrl={ws.logoUrl} className="size-7" />
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

      <CreateOrganizationDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
