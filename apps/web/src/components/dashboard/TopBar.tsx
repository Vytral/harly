"use client";

import { useState } from "react";
import { Activity, Bell, Search, type LucideIcon } from "lucide-react";

import { CommandMenu } from "@/components/dashboard/CommandMenu";
import { QuickCreateMenu } from "@/components/dashboard/QuickCreateMenu";
import { UserMenu } from "@/components/dashboard/UserMenu";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import type { WorkspaceOption } from "@/features/workspaces/data";

type TopBarProps = {
  user: { name: string; email: string; image: string | null };
  role: string;
  workspace: { id: string; name: string; logoUrl: string | null };
  workspaceOptions: WorkspaceOption[];
};

/** Slim utility strip: sidebar toggle + search + create + alerts + theme + user. */
export function TopBar({ user, role, workspace, workspaceOptions }: TopBarProps) {
  const [commandOpen, setCommandOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border/80 bg-background/80 px-4 backdrop-blur-md md:px-6">
      <button
        type="button"
        onClick={() => setCommandOpen(true)}
        className="group ml-1 hidden h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm text-muted-foreground transition hover:border-ring/40 hover:bg-accent/40 sm:flex sm:w-72"
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
        className="text-muted-foreground sm:hidden"
        aria-label="Search"
        onClick={() => setCommandOpen(true)}
      >
        <Search className="size-[18px]" strokeWidth={1.5} />
      </Button>

      <div className="ml-auto flex items-center gap-1">
        <QuickCreateMenu />
        <IconPopover
          icon={Activity}
          label="Activity"
          title="Activity"
          body="Recent moves across your pipeline will show up here."
        />
        <IconPopover
          icon={Bell}
          label="Notifications"
          title="Notifications"
          body="You're all caught up — no new notifications."
        />
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
