"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { WorkspaceOption } from "@/features/workspaces/data";

/** Company logo, or its initial as a fallback mark. */
export function WorkspaceMark({
  name,
  logoUrl,
  className,
  priority,
}: {
  name: string;
  logoUrl?: string | null;
  className?: string;
  priority?: boolean;
}) {
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);

  if (logoUrl && logoUrl !== failedLogoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name}
        onError={() => setFailedLogoUrl(logoUrl)}
        className={cn(
          "aspect-square size-8 shrink-0 rounded-lg object-cover",
          className,
        )}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
      />
    );
  }
  return (
    <div
      className={cn(
        "flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-near-ink text-sm font-semibold text-pure-snow",
        className,
      )}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

/**
 * Workspace switcher for the header's left edge: square mark, workspace name
 * with a small subtitle, and a chevron when the viewer belongs to more than one
 * workspace. Below `md` it collapses to the mark alone.
 */
export function WorkspaceSwitcher({
  workspace,
  workspaceOptions,
  subtitle,
  markUrl,
  wordmark,
}: {
  workspace: { id: string; name: string; logoUrl: string | null };
  workspaceOptions: WorkspaceOption[];
  subtitle?: string;
  /** Square logo override (the sidebar branding may carry a wordmark). */
  markUrl?: string | null;
  /**
   * "Full logo" branding: the wordmark already says the workspace's name, so
   * it replaces the mark and the name text entirely.
   */
  wordmark?: { lightUrl: string; darkUrl: string | null } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const switchable = workspaceOptions.length > 1;

  function switchTo(organizationId: string) {
    if (organizationId === workspace.id) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const result = await authClient.organization.setActive({
        organizationId,
      });
      if (!result.error) {
        setOpen(false);
        router.replace("/dashboard");
        router.refresh();
      }
    });
  }

  const content = wordmark ? (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- tenant upload, arbitrary aspect ratio */}
      <img
        src={wordmark.lightUrl}
        alt=""
        className={cn(
          "h-8 w-auto max-w-[180px] object-contain object-left",
          wordmark.darkUrl && "dark:hidden",
        )}
      />
      {wordmark.darkUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- tenant upload, arbitrary aspect ratio
        <img
          src={wordmark.darkUrl}
          alt=""
          className="hidden h-8 w-auto max-w-[180px] object-contain object-left dark:block"
        />
      ) : null}
      <span className="sr-only">{workspace.name}</span>
    </>
  ) : (
    <>
      <WorkspaceMark
        name={workspace.name}
        logoUrl={markUrl === undefined ? workspace.logoUrl : markUrl}
        className="size-9 rounded-[10px]"
        priority
      />
      <span className="hidden min-w-0 flex-col text-left md:flex">
        <span className="max-w-[160px] truncate text-[15px] font-semibold leading-5 tracking-tight text-near-ink">
          {workspace.name}
        </span>
        {subtitle ? (
          <span className="max-w-[160px] truncate text-[12px] leading-4 text-soft-ink">
            {subtitle}
          </span>
        ) : null}
      </span>
    </>
  );

  const triggerClass =
    "flex min-w-0 items-center gap-2.5 rounded-[12px] p-1 pr-1.5 transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink";

  if (!switchable) {
    return (
      <Link
        href="/dashboard"
        aria-label={`${workspace.name}, go to home`}
        className={cn(triggerClass, "hover:bg-pure-snow/60 md:pr-3")}
      >
        {content}
      </Link>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`Switch workspace, current: ${workspace.name}`}
        className={cn(
          triggerClass,
          "hover:bg-pure-snow/60 data-[state=open]:bg-pure-snow/70",
        )}
      >
        {content}
        <ChevronDown
          className="hidden size-4 shrink-0 text-near-ink md:block"
          strokeWidth={2}
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-64 rounded-[var(--radius-card)] border-0 p-2 shadow-[var(--shadow-float)]"
      >
        <p className="type-col-head px-2 py-1.5">Workspace</p>
        {workspaceOptions.map((ws) => (
          <button
            key={ws.authOrganizationId}
            type="button"
            onClick={() => switchTo(ws.authOrganizationId)}
            disabled={isPending}
            aria-current={ws.isActive ? "true" : undefined}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-[10px] px-2 py-2 transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink disabled:opacity-50",
              ws.isActive ? "bg-row-wash" : "hover:bg-row-wash/70",
            )}
          >
            <WorkspaceMark
              name={ws.name}
              logoUrl={ws.logoUrl}
              className="size-8 rounded-[10px]"
            />
            <span className="flex-1 truncate text-left text-[14px] font-medium text-near-ink">
              {ws.name}
            </span>
            {ws.isActive ? (
              <Check className="size-4 shrink-0 text-near-ink" strokeWidth={2} />
            ) : null}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
