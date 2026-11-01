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
      className="h-14 border-hairline bg-pure-snow/80"
      left={
        <button
          type="button"
          onClick={onExit}
          className="group inline-flex items-center gap-2 rounded-full bg-soft-kraft py-1.5 pl-2.5 pr-3.5 text-[13px] font-medium text-soft-ink transition-all duration-150 hover:bg-row-wash hover:text-near-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink active:scale-[0.97]"
        >
          <ArrowLeft className="size-4 transition-transform duration-150 group-hover:-translate-x-0.5" />
          <span className="hidden sm:inline">Jobs</span>
        </button>
      }
      center={
        <div className="flex min-w-0 max-w-[40vw] items-center gap-2">
          {eyebrow ? (
            <span className="hidden shrink-0 text-[11px] font-semibold uppercase tracking-wider text-soft-ink md:inline">
              {eyebrow}
            </span>
          ) : null}
          <span className="hidden truncate font-display text-[15px] text-near-ink md:inline">
            {title || "New job"}
          </span>
          {railActions ? (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-1 truncate text-sm font-semibold text-near-ink md:hidden"
                >
                  <span className="truncate">{title || "New job"}</span>
                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="center" className="w-64 max-w-[calc(100vw-2rem)] space-y-1.5">
                {railActions}
              </PopoverContent>
            </Popover>
          ) : (
            <span className="truncate text-sm font-semibold text-near-ink md:hidden">
              {title || "New job"}
            </span>
          )}
          {statusBadge}
        </div>
      }
      right={
        <>
          {headerActions}
          {headerActions ? <span className="mx-0.5 h-5 w-px bg-hairline" aria-hidden="true" /> : null}
          {actions}
        </>
      }
    />
  );
}
