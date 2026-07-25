"use client";

import { useState, useTransition } from "react";
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
 * The centered workspace pill , the only thing in the middle of the top bar
 * (DESIGN.md , Top Bar). Reads `{Workspace} / All ▾` behind a small chartreuse
 * brand dot. No page title, no breadcrumb: the page names itself in content.
 */
export function WorkspacePill({
  workspace,
  workspaceOptions,
}: {
  workspace: { id: string; name: string; logoUrl: string | null };
  workspaceOptions: WorkspaceOption[];
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

  const label = (
    <>
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full bg-chartreuse-signal"
      />
      <span className="max-w-[180px] truncate text-[14px] font-medium text-near-ink">
        {workspace.name}
      </span>
      <span className="text-[14px] text-quiet-mist">/</span>
      <span className="text-[14px] text-soft-ink">All</span>
    </>
  );

  if (!switchable) {
    return (
      <div className="flex h-8 items-center gap-2 rounded-full border border-mist-border bg-pure-snow px-3">
        {label}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="Switch workspace"
        className="flex h-8 items-center gap-2 rounded-full border border-mist-border bg-pure-snow px-3 transition-colors hover:bg-row-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
      >
        {label}
        <ChevronDown
          className="size-3.5 shrink-0 text-quiet-mist"
          strokeWidth={2}
        />
      </PopoverTrigger>
      <PopoverContent align="center" sideOffset={8} className="w-64 p-2">
        <p className="type-col-head px-2 py-1.5">Workspace</p>
        {workspaceOptions.map((ws) => (
          <button
            key={ws.authOrganizationId}
            type="button"
            onClick={() => switchTo(ws.authOrganizationId)}
            disabled={isPending}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-[10px] px-2 py-2 transition-colors disabled:opacity-50",
              ws.isActive ? "bg-row-wash" : "hover:bg-row-wash/70",
            )}
          >
            <WorkspaceMark
              name={ws.name}
              logoUrl={ws.logoUrl}
              className="size-7 rounded-[9px]"
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
