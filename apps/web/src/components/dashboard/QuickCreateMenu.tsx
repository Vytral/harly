"use client";

import Link from "next/link";
import { Briefcase, CalendarPlus, Plus, UserPlus } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function Items() {
  return (
    <>
      <DropdownMenuLabel className="type-col-head">Create</DropdownMenuLabel>
      <DropdownMenuItem asChild className="gap-2.5">
        <Link href="/dashboard/jobs/new">
          <Briefcase className="size-4 text-soft-ink" strokeWidth={1.8} />
          New job
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild className="gap-2.5">
        <Link href="/dashboard/candidates">
          <UserPlus className="size-4 text-soft-ink" strokeWidth={1.8} />
          Add candidate
        </Link>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild className="gap-2.5">
        <Link href="/dashboard/calendars">
          <CalendarPlus className="size-4 text-soft-ink" strokeWidth={1.8} />
          Schedule interview
        </Link>
      </DropdownMenuItem>
    </>
  );
}

/**
 * The "+" in the icon rail (frame 01 puts create in the icon group, not the top
 * bar). It is an *action*, not a destination, so it doesn't count against the
 * five-primary-nav cap , but it is deliberately quiet: ink on hover wash, not a
 * chartreuse button. Chartreuse in the shell is reserved for the AI signal.
 */
export function QuickCreateButton() {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger
            aria-label="Create"
            className="flex size-10 items-center justify-center rounded-[12px] border border-mist-border bg-pure-snow text-near-ink transition-colors hover:bg-row-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
          >
            <Plus className="size-[18px]" strokeWidth={2} />
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">Create</TooltipContent>
      </Tooltip>
      <DropdownMenuContent side="right" align="start" className="min-w-52">
        <Items />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
