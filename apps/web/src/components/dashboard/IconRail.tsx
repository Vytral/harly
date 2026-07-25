"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal, UserPlus } from "lucide-react";

import { cn } from "@/lib/utils";
import { QuickCreateButton } from "@/components/dashboard/QuickCreateMenu";
import { WorkspaceMark } from "@/components/dashboard/WorkspaceSwitcher";
import {
  hasNavPermission,
  isNavActive,
  moreNav,
  primaryNav,
  settingsNav,
  type NavItem,
} from "@/components/dashboard/nav-items";
import {
  InviteTeammatesSheet,
  type AssignableRole,
} from "@/features/workspaces/InviteTeammatesSheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SidebarBranding } from "@/features/workspaces/data";
import type { Permission } from "@/features/workspaces/permissions";

/**
 * The icon rail , Harly's primary navigation (DESIGN.md , Icon Rail Sidebar).
 *
 * Deliberately NOT the shadcn sidebar kit this replaced. That kit gave us a
 * collapsible label warehouse whose chrome talked louder than the work; the
 * rail is a fixed 60px strip of at most five destinations, flat on the paper
 * canvas, active state a soft wash rather than a green brick. Labels live in
 * tooltips because the icons never expand.
 */
export function IconRail({
  workspace,
  inboxCount,
  taskDueCount,
  userPermissions,
  sidebarLogo,
  assignableRoles,
}: {
  workspace: { id: string; name: string; logoUrl: string | null };
  inboxCount: number;
  taskDueCount: number;
  userPermissions: Permission[];
  sidebarLogo: SidebarBranding;
  assignableRoles: AssignableRole[];
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="hidden w-[var(--spacing-rail)] shrink-0 flex-col items-center gap-1 bg-warm-paper py-3 md:flex"
    >
      <Link
        href="/dashboard"
        aria-label={`${workspace.name}, go to home`}
        className="mb-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
      >
        <BrandMark workspace={workspace} sidebarLogo={sidebarLogo} />
      </Link>

      {primaryNav.map((item) => (
        <RailLink
          key={item.href}
          item={item}
          active={isNavActive(pathname, item)}
          count={badgeCount(item, inboxCount, taskDueCount)}
        />
      ))}

      <MoreMenu
        pathname={pathname}
        userPermissions={userPermissions}
        taskDueCount={taskDueCount}
      />

      <div className="mt-4">
        <QuickCreateButton />
      </div>

      <div className="mt-auto flex flex-col items-center gap-1">
        <InviteButton assignableRoles={assignableRoles} userPermissions={userPermissions} />
        {hasNavPermission(settingsNav, userPermissions) ? (
          <RailLink
            item={settingsNav}
            active={isNavActive(pathname, settingsNav)}
          />
        ) : null}
      </div>
    </nav>
  );
}

function badgeCount(item: NavItem, inboxCount: number, taskDueCount: number) {
  if (item.badge === "inbox") return inboxCount;
  if (item.badge === "tasks") return taskDueCount;
  return 0;
}

/** 40px tap target, soft wash when active. No label , the tooltip carries it. */
function RailLink({
  item,
  active,
  count = 0,
}: {
  item: NavItem;
  active: boolean;
  count?: number;
}) {
  const Icon = item.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={item.href}
          aria-label={item.label}
          aria-current={active ? "page" : undefined}
          className={cn(
            "relative flex size-10 items-center justify-center rounded-[12px] transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink",
            active
              ? "bg-row-wash text-near-ink"
              : "text-soft-ink hover:bg-row-wash/70 hover:text-near-ink",
          )}
        >
          <Icon className="size-[19px]" strokeWidth={1.8} />
          {count > 0 ? <UnreadDot count={count} /> : null}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Chartreuse is a live signal, so an unread count is one of the few places it
 * earns its keep in the rail (DESIGN.md , accent rationing).
 */
function UnreadDot({ count }: { count: number }) {
  return (
    <span
      aria-hidden="true"
      className="font-chrome absolute -right-0.5 -top-0.5 flex min-w-[17px] items-center justify-center rounded-full bg-chartreuse-signal px-1 text-[10px] leading-[16px] text-chartreuse-ink ring-2 ring-warm-paper"
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

function BrandMark({
  workspace,
  sidebarLogo,
}: {
  workspace: { id: string; name: string; logoUrl: string | null };
  sidebarLogo: SidebarBranding;
}) {
  // The rail is 60px wide, so only a square mark can live here. `style: "full"`
  // is a wordmark , it would render as a sliver of clipped letters, so fall back
  // to the organisation's square logo (or its initial).
  const markUrl =
    sidebarLogo.style === "bordered"
      ? (sidebarLogo.lightUrl ?? workspace.logoUrl)
      : workspace.logoUrl;
  return (
    <WorkspaceMark
      name={workspace.name}
      logoUrl={markUrl}
      className="size-9 rounded-[11px]"
      priority
    />
  );
}

/** The 5th rail slot: a grouped index of everything that isn't daily work. */
function MoreMenu({
  pathname,
  userPermissions,
  taskDueCount,
}: {
  pathname: string;
  userPermissions: Permission[];
  taskDueCount: number;
}) {
  const [open, setOpen] = useState(false);

  const groups = moreNav
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        hasNavPermission(item, userPermissions),
      ),
    }))
    .filter((group) => group.items.length > 0);

  const anyActive = groups.some((group) =>
    group.items.some((item) => isNavActive(pathname, item)),
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger
            aria-label="More"
            className={cn(
              "relative flex size-10 items-center justify-center rounded-[12px] transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink",
              anyActive || open
                ? "bg-row-wash text-near-ink"
                : "text-soft-ink hover:bg-row-wash/70 hover:text-near-ink",
            )}
          >
            <MoreHorizontal className="size-[19px]" strokeWidth={1.8} />
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">More</TooltipContent>
      </Tooltip>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={10}
        className="w-64 p-2"
      >
        {groups.map((group, index) => (
          <div key={group.label} className={cn(index > 0 && "mt-1 pt-1")}>
            <p className="type-col-head px-2 py-1.5">{group.label}</p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isNavActive(pathname, item);
              const count = item.badge === "tasks" ? taskDueCount : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-start gap-2.5 rounded-[10px] px-2 py-2 transition-colors",
                    active ? "bg-row-wash" : "hover:bg-row-wash/70",
                  )}
                >
                  <Icon
                    className="mt-0.5 size-4 shrink-0 text-soft-ink"
                    strokeWidth={1.8}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="text-[14px] font-medium text-near-ink">
                        {item.label}
                      </span>
                      {count > 0 ? (
                        <span className="font-chrome rounded-full bg-chartreuse-signal px-1.5 text-[11px] leading-[17px] text-chartreuse-ink">
                          {count}
                        </span>
                      ) : null}
                    </span>
                    {item.hint ? (
                      <span className="mt-0.5 block truncate text-[12px] text-soft-ink">
                        {item.hint}
                      </span>
                    ) : null}
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function InviteButton({
  assignableRoles,
  userPermissions,
}: {
  assignableRoles: AssignableRole[];
  userPermissions: Permission[];
}) {
  const [open, setOpen] = useState(false);
  if (!userPermissions.includes("members:invite")) return null;

  return (
    <>
      <InviteTeammatesSheet
        assignableRoles={assignableRoles}
        open={open}
        onOpenChange={setOpen}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Invite team"
            className="flex size-10 items-center justify-center rounded-[12px] text-soft-ink transition-colors hover:bg-row-wash/70 hover:text-near-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
          >
            <UserPlus className="size-[19px]" strokeWidth={1.8} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Invite team</TooltipContent>
      </Tooltip>
    </>
  );
}

/**
 * Mobile nav. The rail is hidden below `md`, so the same destinations arrive as
 * a labelled sheet , on a phone, tooltips aren't reachable and icons alone
 * aren't navigation.
 */
export function MobileNav({
  open,
  onOpenChange,
  workspace,
  inboxCount,
  taskDueCount,
  userPermissions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: { id: string; name: string; logoUrl: string | null };
  inboxCount: number;
  taskDueCount: number;
  userPermissions: Permission[];
}) {
  const pathname = usePathname();

  const groups: { label: string | null; items: NavItem[] }[] = [
    { label: null, items: primaryNav },
    ...moreNav.map((group) => ({
      label: group.label,
      items: group.items.filter((item) =>
        hasNavPermission(item, userPermissions),
      ),
    })),
    {
      label: null,
      items: hasNavPermission(settingsNav, userPermissions)
        ? [settingsNav]
        : [],
    },
  ].filter((group) => group.items.length > 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[280px] p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <div className="flex items-center gap-2.5 px-4 py-4">
          <WorkspaceMark
            name={workspace.name}
            logoUrl={workspace.logoUrl}
            className="size-8 rounded-[10px]"
          />
          <span className="truncate text-[15px] font-medium text-near-ink">
            {workspace.name}
          </span>
        </div>
        <div className="px-2 pb-4">
          {groups.map((group, index) => (
            <div key={group.label ?? `group-${index}`} className="mb-1">
              {group.label ? (
                <p className="type-col-head px-3 py-2">{group.label}</p>
              ) : null}
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isNavActive(pathname, item);
                const count = badgeCount(item, inboxCount, taskDueCount);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => onOpenChange(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-[12px] px-3 py-2.5 transition-colors",
                      active ? "bg-row-wash" : "hover:bg-row-wash/70",
                    )}
                  >
                    <Icon
                      className="size-[18px] shrink-0 text-soft-ink"
                      strokeWidth={1.8}
                    />
                    <span className="flex-1 text-[15px] font-medium text-near-ink">
                      {item.label}
                    </span>
                    {count > 0 ? (
                      <span className="font-chrome rounded-full bg-chartreuse-signal px-1.5 text-[11px] leading-[17px] text-chartreuse-ink">
                        {count}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
