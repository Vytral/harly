"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Activity, ChevronRight, Search, type LucideIcon } from "lucide-react";

import { CommandMenu } from "@/components/dashboard/CommandMenu";
import {
  isNavActive,
  primaryNav,
  workspaceNav,
  moreNav,
} from "@/components/dashboard/nav-items";
import { NotificationsBell } from "@/components/dashboard/NotificationsBell";
import { usePageTitle } from "@/components/dashboard/PageTitleContext";
import { QuickCreateMenu } from "@/components/dashboard/QuickCreateMenu";
import { UserMenu } from "@/components/dashboard/UserMenu";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import type { NotificationItem } from "@/features/notifications/data";
import type { WorkspaceOption } from "@/features/workspaces/data";

type TopBarProps = {
  user: { name: string; email: string; image: string | null };
  role: string;
  workspace: { id: string; name: string; logoUrl: string | null };
  workspaceOptions: WorkspaceOption[];
  notifications: NotificationItem[];
};

export function TopBar({
  user,
  role,
  workspace,
  workspaceOptions,
  notifications,
}: TopBarProps) {
  const [commandOpen, setCommandOpen] = useState(false);
  const { title, breadcrumb } = usePageTitle();
  const pathname = usePathname();

  const allNav = [...primaryNav, ...workspaceNav, ...moreNav];
  const activeNav = allNav.find((item) => isNavActive(pathname, item));
  const SectionIcon = activeNav?.icon;
  const sectionLabel = activeNav?.label;

  // Use explicit PageTitle if set, otherwise fall back to the active nav label.
  const displayTitle = title || sectionLabel;

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border/80 bg-background/80 px-4 backdrop-blur-md md:px-6">
      {displayTitle ? (
        <div className="ml-1 flex min-w-0 items-center gap-1.5">
          {SectionIcon ? (
            <SectionIcon className="size-[18px] shrink-0 text-muted-foreground" strokeWidth={1.5} />
          ) : null}
          {breadcrumb ? (
            <>
              <span className="hidden truncate text-[15px] text-muted-foreground/70 sm:block">
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
        <IconPopover
          icon={Activity}
          label="Activity"
          title="Activity"
          body="Recent moves across your pipeline will show up here."
        />
        <NotificationsBell notifications={notifications} />
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

      <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} />
    </header>
  );
}

function IconPopover({
  icon: Icon,
  label,
  title,
  body,
}: {
  icon: LucideIcon;
  label: string;
  title: string;
  body: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground"
          aria-label={label}
        >
          <Icon className="size-[18px]" strokeWidth={1.5} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      </PopoverContent>
    </Popover>
  );
}
