"use client";

import { useState } from "react";
import { Menu, Moon, Search, Sparkles, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { CommandMenu } from "@/components/dashboard/CommandMenu";
import { MobileNav } from "@/components/dashboard/IconRail";
import { NotificationsBell } from "@/components/dashboard/NotificationsBell";
import { useStickyBar } from "@/components/dashboard/StickyBarContext";
import { UserMenu } from "@/components/dashboard/UserMenu";
import { useHarlyAI } from "@/components/dashboard/HarlyAIWidget";
import { WorkspacePill } from "@/components/dashboard/WorkspaceSwitcher";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { NotificationItem } from "@/features/notifications/data";
import type { WorkspaceOption } from "@/features/workspaces/data";
import type { Permission } from "@/features/workspaces/permissions";

type TopBarProps = {
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
};

/**
 * Quiet chrome (DESIGN.md , Top Bar). One 56px bar: mobile trigger left,
 * workspace pill centered, compact cluster right. That is all.
 *
 * Gone on purpose: the page title + breadcrumb pair (the page names itself in
 * content, so the bar was repeating it), the disabled "Coming soon" Activity
 * button (every one of those burns trust in a public beta), the wide search
 * input (⌘K and an icon do the same job in a fifth of the space), and the
 * standalone theme toggle (folded into the overflow menu).
 */
export function TopBar({
  user,
  role,
  workspace,
  workspaceOptions,
  notifications,
  unreadNotificationCount,
  userPermissions,
  inboxCount,
  taskDueCount,
}: TopBarProps) {
  const [commandOpen, setCommandOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { stickyBarVisible } = useStickyBar();

  return (
    <div
      className={cn(
        "sticky top-0 z-30 grid transition-[grid-template-rows] duration-300",
        stickyBarVisible ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
      )}
    >
      <header
        className={cn(
          "flex h-[var(--spacing-topbar)] items-center gap-2 overflow-hidden px-3 md:px-4",
          stickyBarVisible && "pointer-events-none",
        )}
      >
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open navigation"
          className="flex size-9 items-center justify-center rounded-[12px] text-soft-ink transition-colors hover:bg-row-wash hover:text-near-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink md:hidden"
        >
          <Menu className="size-[18px]" strokeWidth={1.8} />
        </button>

        {/* Centered regardless of how wide the two side clusters are. */}
        <div className="pointer-events-none absolute inset-x-0 flex h-[var(--spacing-topbar)] items-center justify-center">
          <div className="pointer-events-auto">
            <WorkspacePill
              workspace={workspace}
              workspaceOptions={workspaceOptions}
            />
          </div>
        </div>

        <div className="z-10 ml-auto flex items-center gap-1">
          <AiSignalButton />
          <UserMenu
            user={user}
            role={role}
            workspace={workspace}
            workspaceOptions={workspaceOptions}
          />
          <IconButton
            label="Search"
            onClick={() => setCommandOpen(true)}
            hint="⌘K"
          >
            <Search className="size-[18px]" strokeWidth={1.8} />
          </IconButton>
          <NotificationsBell
            notifications={notifications}
            unreadCount={unreadNotificationCount}
          />
          <OverflowMenu />
        </div>

        <CommandMenu
          open={commandOpen}
          onOpenChange={setCommandOpen}
          userPermissions={userPermissions}
        />
      </header>

      <MobileNav
        open={mobileNavOpen}
        onOpenChange={setMobileNavOpen}
        workspace={workspace}
        inboxCount={inboxCount}
        taskDueCount={taskDueCount}
        userPermissions={userPermissions}
      />
    </div>
  );
}

function IconButton({
  label,
  hint,
  onClick,
  children,
}: {
  label: string;
  hint?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className="flex size-9 items-center justify-center rounded-[12px] text-soft-ink transition-colors hover:bg-row-wash hover:text-near-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-2">
        {label}
        {hint ? (
          <kbd className="font-chrome text-[11px] text-quiet-mist">{hint}</kbd>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The one chartreuse fill in the shell. AI is a live signal, which is exactly
 * what the accent is for , and it is the only place in the top bar that gets it
 * (DESIGN.md , accent rationing). Hidden entirely when AI isn't configured,
 * rather than shown disabled.
 */
function AiSignalButton() {
  const { open, toggle, enabled } = useHarlyAI();
  if (!enabled) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={toggle}
          aria-label={open ? "Close Harly AI" : "Ask Harly AI"}
          aria-pressed={open}
          className={cn(
            "mr-1 flex size-9 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink",
            open
              ? "bg-near-ink text-pure-snow"
              : "bg-chartreuse-signal text-chartreuse-ink hover:brightness-[0.97]",
          )}
        >
          <Sparkles className="size-[17px]" strokeWidth={2} />
        </button>
      </TooltipTrigger>
      <TooltipContent>{open ? "Close Harly AI" : "Ask Harly AI"}</TooltipContent>
    </Tooltip>
  );
}

/** Rare chrome lives here so the bar stays at five controls. */
function OverflowMenu() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="More options"
        className="flex size-9 items-center justify-center rounded-[12px] text-soft-ink transition-colors hover:bg-row-wash hover:text-near-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="12" cy="5" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="12" cy="19" r="1" />
        </svg>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem
          className="gap-2.5"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          <Sun className="size-4 text-soft-ink dark:hidden" strokeWidth={1.8} />
          <Moon
            className="hidden size-4 text-soft-ink dark:block"
            strokeWidth={1.8}
          />
          {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
