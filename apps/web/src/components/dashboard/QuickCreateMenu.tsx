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
 * The compact ink "+ New" button in the header. It is an *action*, not a
 * destination; ink is the action colour, so it is the one solid control in the
 * band. Icon-only below `md`, where the header row is tight.
 */
export function QuickCreateButton() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Create"
        className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-btn)] bg-near-ink px-2.5 text-[14px] font-medium text-pure-snow transition-colors duration-150 ease-out hover:bg-near-ink/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink focus-visible:ring-offset-2 focus-visible:ring-offset-lime-wash md:px-3.5"
      >
        <Plus className="size-4" strokeWidth={2.25} />
        <span className="hidden md:inline">New</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="min-w-52">
        <Items />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
