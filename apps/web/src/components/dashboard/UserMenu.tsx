"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  BookOpen,
  Building2,
  Check,
  ExternalLink,
  ListChecks,
  LogOut,
  MessageSquare,
  UserRound,
} from "lucide-react";
import Link from "next/link";

import { authClient, signOut } from "@/lib/auth-client";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { GithubIcon } from "@/components/ui/icons/GithubIcon";
import { WorkspaceMark } from "@/components/dashboard/WorkspaceSwitcher";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { WorkspaceOption } from "@/features/workspaces/data";
import { restoreSetupChecklistAction } from "@/features/onboarding/checklist-actions";

// Root package.json version, inlined by next.config.ts at build time.
const VERSION = process.env.NEXT_PUBLIC_HARLY_VERSION
  ? `v${process.env.NEXT_PUBLIC_HARLY_VERSION}`
  : null;
const REPO_URL = "https://github.com/Vytral/harly";
const ISSUES_URL = `${REPO_URL}/issues`;
const DOCS_URL = "https://docs.harly.dev";

type UserMenuProps = {
  user: { name: string; email: string; image: string | null; username: string | null };
  role: string;
  workspace: { id: string; name: string; logoUrl: string | null };
  workspaceOptions: WorkspaceOption[];
  /** The public demo hides the beta chip and the checklist restore entry. */
  demoMode?: boolean;
};

/** Shared row styling for the menu's action items (overrides the Radix item defaults). */
const itemClass =
  "gap-2.5 rounded-lg px-2 py-2 text-sm text-foreground/80 hover:text-foreground";

function formatRole(role: string) {
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function UserMenu({
  user,
  role,
  workspace,
  workspaceOptions,
  demoMode = false,
}: UserMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(async () => {
      await signOut();
      router.replace("/login");
      router.refresh();
    });
  }

  function showSetupChecklist() {
    startTransition(async () => {
      const result = await restoreSetupChecklistAction();
      setOpen(false);
      if (result.ok) {
        router.replace("/dashboard");
        router.refresh();
      }
    });
  }

  const canRestoreChecklist =
    !demoMode && (role === "owner" || role === "admin");

  function switchTo(organizationId: string) {
    if (organizationId === workspace.id) return;
    startTransition(async () => {
      const result = await authClient.organization.setActive({
        organizationId,
      });
      if (!result.error) {
        router.replace("/dashboard");
        router.refresh();
      }
    });
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex shrink-0 items-center rounded-full ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Account menu"
        >
          <UserAvatar name={user.name} src={user.image} size="md" priority />
        </button>
      </DropdownMenuTrigger>

      {/* Radix portals the content and provides the menu semantics, roving
          focus, Escape-to-close and focus return to the trigger. */}
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-80 overflow-hidden rounded-xl border bg-popover p-0 shadow-xl shadow-black/5"
      >
        {/* ── User info ── */}
        <div className="flex items-center gap-3 px-4 py-4">
          <UserAvatar name={user.name} src={user.image} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {user.email}
            </p>
          </div>
          <Badge
            variant="secondary"
            className="shrink-0 text-[11px] font-normal"
          >
            {formatRole(role)}
          </Badge>
        </div>

        {/* Workspace switcher — hidden when there are no options
            (e.g. demo mode passes an empty list on purpose). */}
        {workspaceOptions.length > 0 ? (
          <>
            <DropdownMenuSeparator className="m-0" />

            <div className="px-3 py-3">
              <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                Workspace
              </p>
              <div className="space-y-0.5">
                {workspaceOptions.map((ws) => (
                  <DropdownMenuItem
                    key={ws.authOrganizationId}
                    disabled={isPending}
                    onSelect={() => switchTo(ws.authOrganizationId)}
                    className={cn(
                      "gap-2.5 rounded-lg px-2 py-2 text-sm hover:bg-accent",
                      ws.isActive && "bg-accent/50",
                    )}
                  >
                    <WorkspaceMark
                      name={ws.name}
                      logoUrl={ws.logoUrl}
                      className="size-7 shrink-0"
                    />
                    <span className="flex-1 truncate text-left">
                      {ws.name}
                    </span>
                    {ws.isActive && (
                      <Check className="size-3.5 shrink-0 text-primary" />
                    )}
                  </DropdownMenuItem>
                ))}
              </div>
            </div>
          </>
        ) : null}

        <DropdownMenuSeparator className="m-0" />

        {/* ── Nav actions ── */}
        <div className="px-3 py-2">
          {user.username && (
            <DropdownMenuItem asChild className={itemClass}>
              <Link href={`/people/${user.username}` as Route}>
                <ExternalLink
                  className="size-4 text-muted-foreground"
                  strokeWidth={1.5}
                />
                View profile
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild className={itemClass}>
            <Link href={"/account" as Route}>
              <UserRound
                className="size-4 text-muted-foreground"
                strokeWidth={1.5}
              />
              Account settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className={itemClass}>
            <Link href="/settings">
              <Building2
                className="size-4 text-muted-foreground"
                strokeWidth={1.5}
              />
              Organization settings
            </Link>
          </DropdownMenuItem>
          {canRestoreChecklist ? (
            <DropdownMenuItem
              disabled={isPending}
              // Stay open until the restore finishes; showSetupChecklist closes it.
              onSelect={(event) => {
                event.preventDefault();
                showSetupChecklist();
              }}
              className={itemClass}
            >
              <ListChecks
                className="size-4 text-muted-foreground"
                strokeWidth={1.5}
              />
              Show setup checklist
            </DropdownMenuItem>
          ) : null}
        </div>

        <DropdownMenuSeparator className="m-0" />

        {/* ── GitHub ── */}
        <div className="px-3 py-2">
          <DropdownMenuItem asChild className={itemClass}>
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              <GithubIcon className="size-4 text-muted-foreground" />
              <span className="flex-1">Star on GitHub</span>
              <ExternalLink className="size-3 text-muted-foreground/60" />
            </a>
          </DropdownMenuItem>
        </div>

        {/* ── Public beta: quiet status, plus where to get help ── */}
        {!demoMode ? (
          <>
            <DropdownMenuSeparator className="m-0" />
            <div className="px-3 py-2">
              <div className="flex items-center justify-between px-2 py-1.5">
                <Badge variant="outline" className="text-[11px] font-normal">
                  Public beta
                </Badge>
                {VERSION ? (
                  <span className="font-mono text-[0.65rem] text-muted-foreground">
                    {VERSION}
                  </span>
                ) : null}
              </div>
              <DropdownMenuItem asChild className={itemClass}>
                <a href={DOCS_URL} target="_blank" rel="noreferrer">
                  <BookOpen className="size-4 text-muted-foreground" strokeWidth={1.5} />
                  <span className="flex-1">Documentation</span>
                  <ExternalLink className="size-3 text-muted-foreground/60" />
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className={itemClass}>
                <a href={ISSUES_URL} target="_blank" rel="noreferrer">
                  <MessageSquare className="size-4 text-muted-foreground" strokeWidth={1.5} />
                  <span className="flex-1">Report an issue</span>
                  <ExternalLink className="size-3 text-muted-foreground/60" />
                </a>
              </DropdownMenuItem>
            </div>
          </>
        ) : null}

        <DropdownMenuSeparator className="m-0" />

        {/* ── Sign out ── */}
        <div className="px-3 py-2">
          <DropdownMenuItem
            variant="destructive"
            disabled={isPending}
            // Stay open while signing out; the redirect replaces the page.
            onSelect={(event) => {
              event.preventDefault();
              handleSignOut();
            }}
            className="gap-2.5 rounded-lg px-2 py-2 text-sm"
          >
            <LogOut className="size-4" strokeWidth={1.5} />
            {isPending ? "Signing out…" : "Sign out"}
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
