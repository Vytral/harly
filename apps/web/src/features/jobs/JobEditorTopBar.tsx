"use client";

import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

import { FocusModeTopBar } from "@/components/focus-mode/FocusModeTopBar";

export function JobEditorTopBar({
  onExit,
  title,
  eyebrow,
  statusBadge,
  headerActions,
  actions,
}: {
  onExit: () => void;
  title: string;
  eyebrow?: string;
  statusBadge?: ReactNode;
  headerActions?: ReactNode;
  actions: ReactNode;
}) {
  return (
    <FocusModeTopBar
      left={
        <button
          type="button"
          onClick={onExit}
          className="group inline-flex items-center gap-2 rounded-full border border-border bg-paper-raised/60 py-1.5 pl-2.5 pr-3.5 text-sm font-medium text-ink-soft shadow-sm transition-all duration-150 hover:border-pine/30 hover:bg-kraft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine/30 active:scale-[0.97]"
        >
          <ArrowLeft className="size-4 transition-transform duration-150 group-hover:-translate-x-0.5" />
          <span className="hidden sm:inline">Jobs</span>
        </button>
      }
      center={
        <div className="flex min-w-0 max-w-[40vw] items-center gap-2">
          {eyebrow ? (
            <span className="hidden shrink-0 text-[11px] font-semibold uppercase tracking-wider text-ink-soft md:inline">
              {eyebrow}
            </span>
          ) : null}
          <span className="truncate text-sm font-semibold text-foreground">
            {title || "New job"}
          </span>
          {statusBadge}
        </div>
      }
      right={
        <>
          {headerActions}
          {headerActions ? <span className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" /> : null}
          {actions}
        </>
      }
    />
  );
}
