"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Building2,
  Check,
  ExternalLink,
  LogOut,
  Plus,
  UserRound,
} from "lucide-react";
import Link from "next/link";

import { authClient, signOut } from "@/lib/auth-client";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { GithubIcon } from "@/components/ui/icons/GithubIcon";
import {
  WorkspaceMark,
  CreateOrganizationDialog,
} from "@/components/dashboard/WorkspaceSwitcher";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { WorkspaceOption } from "@/features/workspaces/data";

const VERSION = "v0.1.0";
const REPO_URL = "https://github.com/harly/harly";

type UserMenuProps = {
  user: { name: string; email: string; image: string | null };
  role: string;
  workspace: { id: string; name: string; logoUrl: string | null };
  workspaceOptions: WorkspaceOption[];
};

function formatRole(role: string) {
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function UserMenu({
  user,
  role,
  workspace,
  workspaceOptions,
}: UserMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(async () => {
      await signOut();
      router.replace("/login");
      router.refresh();
    });
  }

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
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center rounded-full ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label="Account menu"
        aria-expanded={open}
      >
        <UserAvatar name={user.name} src={user.image} size="md" priority />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Panel */}
      {open && (
        <div
          className="absolute right-4 top-14 z-50 w-80 overflow-hidden rounded-xl border bg-popover shadow-xl shadow-black/5"
          role="menu"
        >
          {/* ── User info ── */}
          <div className="flex items-center gap-3 px-4 py-4">
            <UserAvatar name={user.name} src={user.image} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
            <Badge
              variant="secondary"
              className="shrink-0 text-[11px] font-normal"
            >
              {formatRole(role)}
            </Badge>
          </div>

          <div className="h-px bg-border" />

          {/* ── Workspace switcher ── */}
          <div className="px-3 py-3">
            <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/60">
              Workspace
            </p>
            <div className="space-y-0.5">
              {workspaceOptions.map((ws) => (
                <button
                  key={ws.authOrganizationId}
                  onClick={() => {
                    switchTo(ws.authOrganizationId);
                    setOpen(false);
                  }}
                  disabled={isPending}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-accent",
                    ws.isActive && "bg-accent/50",
                  )}
                >
                  <WorkspaceMark
                    name={ws.name}
                    logoUrl={ws.logoUrl}
                    className="size-7 shrink-0"
                  />
                  <span className="flex-1 truncate text-left">{ws.name}</span>
                  {ws.isActive && (
                    <Check className="size-3.5 shrink-0 text-primary" />
                  )}
                </button>
              ))}
              <button
                onClick={() => {
                  setOpen(false);
                  setCreateOpen(true);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-dashed">
                  <Plus className="size-3.5" />
                </span>
                <span>New workspace</span>
              </button>
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* ── Nav actions ── */}
          <div className="px-3 py-2">
            <Link
              href={"/account" as Route}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
            >
              <UserRound className="size-4 text-muted-foreground" strokeWidth={1.5} />
              Account settings
            </Link>
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
            >
              <Building2 className="size-4 text-muted-foreground" strokeWidth={1.5} />
              Organization settings
            </Link>
          </div>

          <div className="h-px bg-border" />

          {/* ── GitHub ── */}
          <div className="px-3 py-2">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
            >
              <GithubIcon className="size-4 text-muted-foreground" />
              <span className="flex-1">Star on GitHub</span>
              <Badge
                variant="secondary"
                className="font-mono text-[0.65rem] font-normal"
              >
                {VERSION}
              </Badge>
              <ExternalLink className="size-3 text-muted-foreground/60" />
            </a>
          </div>

          <div className="h-px bg-border" />

          {/* ── Sign out ── */}
          <div className="px-3 py-2">
            <button
              type="button"
              disabled={isPending}
              onClick={handleSignOut}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
            >
              <LogOut className="size-4" strokeWidth={1.5} />
              {isPending ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      )}

      <CreateOrganizationDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
