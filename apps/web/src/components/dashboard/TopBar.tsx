"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Activity, ChevronRight, Search, type LucideIcon } from "lucide-react";

import { CommandMenu } from "@/components/dashboard/CommandMenu";
import {
  isNavActive,
  primaryNav,
  workspaceNav,
} from "@/components/dashboard/nav-items";
import { NotificationsBell } from "@/components/dashboard/NotificationsBell";
import { usePageTitle } from "@/components/dashboard/PageTitleContext";
import { QuickCreateMenu } from "@/components/dashboard/QuickCreateMenu";
import { useStickyBar } from "@/components/dashboard/StickyBarContext";
import { UserMenu } from "@/components/dashboard/UserMenu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { NotificationItem } from "@/features/notifications/data";
import type { WorkspaceOption } from "@/features/workspaces/data";
import type { Permission } from "@/features/workspaces/permissions";

type TopBarProps = {
  user: { name: string; email: string; image: string | null };
  role: string;
  workspace: { id: string; name: string; logoUrl: string | null };
  workspaceOptions: WorkspaceOption[];
  notifications: NotificationItem[];
  unreadNotificationCount: number;
  userPermissions: Permission[];
};

export function TopBar({
  user,
  role,
  workspace,
  workspaceOptions,
  notifications,
  unreadNotificationCount,
  userPermissions,
}: TopBarProps) {
  const [commandOpen, setCommandOpen] = useState(false);
  const { title, breadcrumb } = usePageTitle();
  const pathname = usePathname();
  const { stickyBarVisible } = useStickyBar();

  const allNav = [...primaryNav, ...workspaceNav];
  const activeNav = allNav.find((item) => isNavActive(pathname, item));
  const SectionIcon = activeNav?.icon;
  const sectionLabel = activeNav?.label;

  // Use explicit PageTitle if set, otherwise fall back to the active nav label.
  const displayTitle = title || sectionLabel;

  return (
    <div
      className={cn(
        "sticky top-0 z-30 grid transition-[grid-template-rows] duration-300",
        stickyBarVisible ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
      )}
    >
    <header
      className={cn(
        "overflow-hidden flex h-14 items-center gap-2 border-b border-border/80 bg-background/80 px-4 backdrop-blur-md md:px-6",
        stickyBarVisible && "pointer-events-none",
      )}
    >
      <SidebarTrigger className="md:hidden" />

      {displayTitle ? (
        <div className="ml-1 flex min-w-0 items-center gap-1.5">
          {SectionIcon ? (
            <SectionIcon className="size-[18px] shrink-0 text-muted-foreground" strokeWidth={1.5} />
          ) : null}
          {breadcrumb ? (
            <>
              <span className="hidden truncate text-[15px] text-muted-foreground sm:block">
                {breadcrumb}
              </span>
              <ChevronRight className="hidden size-3 shrink-0 text-muted-foreground/40 sm:block" />
            </>
          ) : null}
          <h1 className="truncate text-[15px] font-semibold tracking-tight">{displayTitle}</h1>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setCommandOpen(true)}
        className="group ml-auto hidden h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm text-muted-foreground transition hover:border-ring/40 hover:bg-accent/40 sm:flex sm:w-72"
        aria-label="Search"
      >
        <Search className="size-4 shrink-0" strokeWidth={1.5} />
        <span className="flex-1 text-left">Search candidates, jobs…</span>
        <kbd className="pointer-events-none hidden items-center rounded border bg-muted px-1.5 font-mono text-[0.65rem] font-medium sm:inline-flex">
          ⌘K
        </kbd>
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="ml-auto text-muted-foreground sm:hidden"
        aria-label="Search"
        onClick={() => setCommandOpen(true)}
      >
        <Search className="size-[18px]" strokeWidth={1.5} />
      </Button>

      <div className="flex items-center gap-1 sm:ml-0">
        <QuickCreateMenu />
        <ComingSoonButton icon={Activity} label="Activity" />
        <NotificationsBell notifications={notifications} unreadCount={unreadNotificationCount} />
        <ThemeToggle />
        <div className="ml-1.5 pl-1.5">
          <UserMenu
            user={user}
            role={role}
            workspace={workspace}
            workspaceOptions={workspaceOptions}
          />
        </div>
      </div>

      <CommandMenu
        open={commandOpen}
        onOpenChange={setCommandOpen}
        userPermissions={userPermissions}
      />
    </header>
    </div>
  );
}

function ComingSoonButton({
  icon: Icon,
  label,
}: {
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground"
            aria-label={label}
            disabled
            aria-disabled="true"
          >
            <Icon className="size-[18px]" strokeWidth={1.5} />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>Coming soon. Recent pipeline moves will show up here.</TooltipContent>
    </Tooltip>
  );
}
