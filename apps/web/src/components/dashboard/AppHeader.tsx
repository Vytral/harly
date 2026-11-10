"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  LayoutGrid,
  Search,
  Settings,
} from "lucide-react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";

import {
  COMMAND_MENU_TRIGGER_ID,
  CommandMenu,
} from "@/components/dashboard/CommandMenu";
import { NotificationIsland } from "@/components/dashboard/NotificationIsland";
import { NotificationsBell } from "@/components/dashboard/NotificationsBell";
import { QuickCreateButton, canQuickCreate } from "@/components/dashboard/QuickCreateMenu";
import { GlobalShortcuts } from "@/components/dashboard/shortcuts";
import { SubNav } from "@/components/dashboard/SubNav";
import { useStickyBar } from "@/components/dashboard/StickyBarContext";
import { UserMenu } from "@/components/dashboard/UserMenu";
import { WorkspaceSwitcher } from "@/components/dashboard/WorkspaceSwitcher";
import { headerRoundButton } from "@/components/dashboard/header-styles";
import {
  hasNavPermission,
  isNavActive,
  moreNav,
  resolvePrimaryNav,
  settingsNav,
  type NavItem,
  type ResolvedNavGroup,
} from "@/components/dashboard/nav-items";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  InviteTeammatesSheet,
  type AssignableRole,
} from "@/features/workspaces/InviteTeammatesSheet";
import type { NotificationItem } from "@/features/notifications/data";
import type {
  SidebarBranding,
  WorkspaceOption,
} from "@/features/workspaces/data";
import type { Permission } from "@/features/workspaces/permissions";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";


type AppHeaderProps = {
  user: {
    name: string;
    email: string;
    image: string | null;
    username: string | null;
  };
  role: string;
  workspace: { id: string; name: string; logoUrl: string | null };
  workspaceOptions: WorkspaceOption[];
  notifications: NotificationItem[];
  unreadNotificationCount: number;
  userPermissions: Permission[];
  inboxCount: number;
  taskDueCount: number;
  sidebarLogo: SidebarBranding;
  assignableRoles: AssignableRole[];
  /** When true, show a one-time demo notice in the floating island. */
  demoMode?: boolean;
};

function formatRole(role: string) {
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * The Deel-style header (DESIGN.md , Layout language): a lime-washed band with
 * the workspace switcher on the left, pill tabs in the middle and round icon
 * buttons on the right, with the active group's sub-nav underneath. It replaces
 * the icon rail + top bar. Sticky; gains a blur and hairline once scrolled, and
 * collapses away while a page's own sticky bar (candidate header) is pinned.
 */
export function AppHeader({
  user,
  role,
  workspace,
  workspaceOptions,
  notifications,
  unreadNotificationCount,
  userPermissions,
  inboxCount,
  taskDueCount,
  sidebarLogo,
  assignableRoles,
  demoMode = false,
}: AppHeaderProps) {
  const t = useTranslations("shell.nav");
  const roleText = useTranslations("shell.userMenu");
  const pathname = usePathname();
  const { stickyBarVisible } = useStickyBar();
  const [commandOpen, setCommandOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const counts = { inbox: inboxCount, tasks: taskDueCount };
  const groups = resolvePrimaryNav(userPermissions);
  const moreItems = moreNav.filter((item) =>
    hasNavPermission(item, userPermissions),
  );
  const moreActive = moreItems.some((item) => isNavActive(pathname, item));
  const activeGroup = groups.find((group) => isNavActive(pathname, group.item));
  const subNavItems =
    activeGroup && activeGroup.children.length > 1 ? activeGroup.children : null;

  const canSettings = hasNavPermission(settingsNav, userPermissions);
  const settingsActive = isNavActive(pathname, settingsNav);
  const canInvite = userPermissions.includes("members:invite");

  // `bordered` = square mark + name; `full` = the uploaded wordmark alone.
  const markUrl =
    sidebarLogo.style === "bordered"
      ? (sidebarLogo.lightUrl ?? workspace.logoUrl)
      : workspace.logoUrl;
  const wordmark =
    sidebarLogo.style === "full" && sidebarLogo.lightUrl
      ? { lightUrl: sidebarLogo.lightUrl, darkUrl: sidebarLogo.darkUrl }
      : null;

  return (
    <div
      className={cn(
        "sticky top-0 z-30 grid transition-[grid-template-rows] duration-[var(--motion-slow)] ease-out",
        stickyBarVisible ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
      )}
    >
      <div
        data-scrolled={scrolled || undefined}
        className={cn(
          "min-h-0 overflow-hidden border-b border-transparent transition-[background-color,border-color,backdrop-filter] duration-[var(--motion-base)] ease-out",
          "bg-transparent",
          "data-[scrolled]:border-hairline data-[scrolled]:bg-warm-paper/85 data-[scrolled]:bg-none data-[scrolled]:backdrop-blur-md",
          stickyBarVisible && "pointer-events-none",
        )}
      >
        {/* Equal 1fr side columns put the pills on the true centre line; with
            `auto` sides they drifted left because the action cluster is wider
            than the logo. */}
        <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 px-3 md:h-16 md:gap-x-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:px-5">
          <div className="flex h-14 items-center md:h-16">
            <WorkspaceSwitcher
              workspace={workspace}
              workspaceOptions={workspaceOptions}
              subtitle={roleText.has(`roles.${role}`) ? roleText(`roles.${role}`) : formatRole(role)}
              markUrl={markUrl}
              wordmark={wordmark}
            />
          </div>

          {/* Mobile: its own scrollable row under the logo/actions row.
              Desktop: centred between the switcher and the actions. */}
          <nav
            aria-label={t("main")}
            className="scrollbar-hide col-span-3 row-start-2 -mx-3 overflow-x-auto px-3 pb-2 md:col-span-1 md:col-start-2 md:row-start-1 md:mx-0 md:px-1 md:py-1 md:pb-1"
          >
            <LayoutGroup id="header-pills">
              <ul className="flex w-max items-center gap-1 md:mx-auto">
                {groups.map((group) => (
                  <li key={group.item.messageKey}>
                    <NavPill
                      group={group}
                      active={group === activeGroup}
                      counts={counts}
                    />
                  </li>
                ))}
                {moreItems.length > 0 ? (
                  <li>
                    <MorePill
                      items={moreItems}
                      pathname={pathname}
                      active={moreActive}
                    />
                  </li>
                ) : null}
              </ul>
            </LayoutGroup>
          </nav>

          <div className="col-start-3 row-start-1 flex h-14 items-center justify-end gap-1.5 md:h-16 md:gap-2">
            <QuickCreateButton
              userPermissions={userPermissions}
              onInvite={canInvite ? () => setInviteOpen(true) : undefined}
              open={createOpen}
              onOpenChange={setCreateOpen}
            />
            <SearchButton onClick={() => setCommandOpen(true)} />
            {canSettings ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href={settingsNav.href}
                    aria-label={t("settings")}
                    aria-current={settingsActive ? "page" : undefined}
                    className={cn(
                      headerRoundButton,
                      "hidden lg:inline-flex",
                      settingsActive && "bg-pure-snow text-near-ink",
                    )}
                  >
                    <Settings className="size-[18px]" strokeWidth={1.8} />
                  </Link>
                </TooltipTrigger>
                <TooltipContent>{t("settings")}</TooltipContent>
              </Tooltip>
            ) : null}
            <NotificationsBell
              notifications={notifications}
              unreadCount={unreadNotificationCount}
            />
            <UserMenu
              user={user}
              role={role}
              workspace={workspace}
              workspaceOptions={demoMode ? [] : workspaceOptions}
              demoMode={demoMode}
              onInvite={canInvite ? () => setInviteOpen(true) : undefined}
            />
          </div>
        </header>

        {subNavItems && activeGroup ? (
          <SubNav
            label={t(activeGroup.item.messageKey)}
            icon={activeGroup.item.icon}
            items={subNavItems}
            pathname={pathname}
            counts={counts}
          />
        ) : null}
      </div>

      {/* Toast-like island: floats just under the band, nothing when idle. */}
      {/* Status island: bottom-centre, the same dark pill as toasts (one
          notification surface). Fixed, so it never collides with the sub-nav. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex justify-center px-4">
        <div className="pointer-events-auto max-w-full">
          <NotificationIsland demoMode={demoMode} />
        </div>
      </div>

      <GlobalShortcuts
        userPermissions={userPermissions}
        canCreate={canQuickCreate(userPermissions, canInvite)}
        onOpenSearch={() => setCommandOpen(true)}
        onOpenCreate={() => setCreateOpen(true)}
      />
      <CommandMenu
        open={commandOpen}
        onOpenChange={setCommandOpen}
        userPermissions={userPermissions}
        workspaceId={workspace.id}
      />
      {canInvite ? (
        <InviteTeammatesSheet
          assignableRoles={assignableRoles}
          open={inviteOpen}
          onOpenChange={setInviteOpen}
        />
      ) : null}
    </div>
  );
}

const pillBase =
  "relative inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-[14px] font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink";

/** White pill that glides between tabs; a plain fade when motion is reduced. */
function ActivePillBackdrop() {
  const reduceMotion = useReducedMotion();
  return (
    <motion.span
      layoutId="header-active-pill"
      aria-hidden="true"
      transition={reduceMotion ? { duration: 0 } : spring.pill}
      className="absolute inset-0 rounded-full bg-pure-snow shadow-[var(--shadow-card)] dark:bg-soft-kraft"
    />
  );
}

function CountBadge({ count }: { count: number }) {
  const t = useTranslations("shell.nav");
  if (count <= 0) return null;
  return (
    <span className="font-chrome relative min-w-[18px] rounded-full bg-chartreuse-signal px-1.5 text-center text-[11px] leading-[18px] text-chartreuse-ink">
      {count > 99 ? "99+" : count}
      <span className="sr-only"> {t("pending")}</span>
    </span>
  );
}

function NavPill({
  group,
  active,
  counts,
}: {
  group: ResolvedNavGroup;
  active: boolean;
  counts: { inbox: number; tasks: number };
}) {
  const t = useTranslations("shell.nav");
  const { item } = group;
  const Icon = item.icon;
  const sources = group.children.length > 0 ? group.children : [item];
  const count = sources.reduce(
    (sum, child) => sum + (child.badge ? counts[child.badge] : 0),
    0,
  );

  return (
    <Link
      href={group.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        pillBase,
        active ? "text-near-ink" : "text-soft-ink hover:text-near-ink hover:bg-pure-snow/50",
      )}
    >
      {active ? <ActivePillBackdrop /> : null}
      <Icon className="relative size-[18px] shrink-0" strokeWidth={1.8} />
      <span className="relative">{t(item.messageKey)}</span>
      <CountBadge count={count} />
    </Link>
  );
}

/** "More": a grid of icon tiles for the occasional, set-up surfaces. */
function MorePill({
  items,
  pathname,
  active,
}: {
  items: NavItem[];
  pathname: string;
  active: boolean;
}) {
  const t = useTranslations("shell.nav");
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          pillBase,
          active || open
            ? "text-near-ink"
            : "text-soft-ink hover:bg-pure-snow/50 hover:text-near-ink",
          open && !active && "bg-pure-snow/70",
        )}
      >
        {active ? <ActivePillBackdrop /> : null}
        <LayoutGrid className="relative size-[18px] shrink-0" strokeWidth={1.8} />
        <span className="relative">{t("more")}</span>
        <ChevronDown
          className={cn(
            "relative size-3.5 shrink-0 transition-transform duration-150 ease-out",
            open && "rotate-180",
          )}
          strokeWidth={2}
        />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(92vw,344px)] rounded-[var(--radius-card)] border-0 p-3 shadow-[var(--shadow-float)]"
      >
        <ul
          className="grid gap-1"
          style={{
            gridTemplateColumns: `repeat(${Math.min(items.length, 4)}, minmax(0, 1fr))`,
          }}
        >
          {items.map((item) => {
            const Icon = item.icon;
            const itemActive = isNavActive(pathname, item);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={item.hintKey ? t(item.hintKey) : undefined}
                  onClick={() => setOpen(false)}
                  aria-current={itemActive ? "page" : undefined}
                  className={cn(
                    "group flex flex-col items-center gap-2 rounded-[var(--radius-inner)] px-1 py-3 text-center transition-colors duration-150 ease-out",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink",
                    itemActive ? "bg-lime-wash" : "hover:bg-card-inset",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 items-center justify-center rounded-[10px] transition-colors duration-150 ease-out",
                      itemActive
                        ? "bg-chartreuse-signal text-chartreuse-ink"
                        : "bg-card-inset text-near-ink group-hover:bg-pure-snow",
                    )}
                  >
                    <Icon className="size-[18px]" strokeWidth={1.8} />
                  </span>
                  <span className="text-[12.5px] font-medium leading-4 text-near-ink">
                    {t(item.messageKey)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** Round search button; from `xl` it widens to show the ⌘K hint pill. */
function SearchButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations("shell.nav");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          id={COMMAND_MENU_TRIGGER_ID}
          type="button"
          onClick={onClick}
          aria-label={t("search")}
          aria-keyshortcuts="Meta+K Control+K /"
          className={cn(
            headerRoundButton,
            "xl:w-auto xl:gap-2 xl:pl-3 xl:pr-1.5",
          )}
        >
          <Search className="size-[18px]" strokeWidth={1.8} />
          <kbd className="font-chrome hidden rounded-full bg-near-ink/[0.07] px-2 py-0.5 text-[11.5px] text-soft-ink xl:inline-block">
            ⌘K
          </kbd>
        </button>
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-2 xl:hidden">
        {t("search")}
        <kbd className="font-chrome text-[11px] text-quiet-mist">⌘K</kbd>
        <kbd className="font-chrome text-[11px] text-quiet-mist">/</kbd>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Wears Harly's own mark, not a generic sparkle. Round like its neighbours;
 * when open it flips to ink + a close glyph so it reads as the panel's toggle.
 * Hidden entirely when AI isn't configured, rather than shown disabled.
 */
