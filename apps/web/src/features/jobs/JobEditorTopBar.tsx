"use client";

import type { ReactNode } from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";

import { FocusModeTopBar } from "@/components/focus-mode/FocusModeTopBar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function JobEditorTopBar({
  onExit,
  title,
  eyebrow,
  statusBadge,
  headerActions,
  railActions,
  actions,
}: {
  onExit: () => void;
  title: string;
  eyebrow?: string;
  statusBadge?: ReactNode;
  headerActions?: ReactNode;
  /** View job / Share job / status actions. Shown in the rail on desktop; on
   *  mobile/tablet (no rail) they live behind a tap on the title instead. */
  railActions?: ReactNode;
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
          <span className="hidden truncate text-sm font-semibold text-foreground md:inline">
            {title || "New job"}
          </span>
          {railActions ? (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-1 truncate text-sm font-semibold text-foreground md:hidden"
                >
                  <span className="truncate">{title || "New job"}</span>
                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="center" className="w-64 space-y-1.5">
                {railActions}
              </PopoverContent>
            </Popover>
          ) : (
            <span className="truncate text-sm font-semibold text-foreground md:hidden">
              {title || "New job"}
            </span>
          )}
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
