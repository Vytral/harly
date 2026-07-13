"use client";

import Link from "next/link";
import { Briefcase, CalendarPlus, Plus, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** The "+" quick-create affordance in the top utility bar. */
export function QuickCreateMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground"
          aria-label="Create"
        >
          <Plus className="size-[18px]" strokeWidth={1.8} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          Create
        </DropdownMenuLabel>
        <DropdownMenuItem asChild className="gap-2.5">
          <Link href="/dashboard/jobs/new">
            <Briefcase className="size-4 text-muted-foreground" strokeWidth={1.8} />
            New job
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="gap-2.5">
          <Link href="/dashboard/candidates">
            <UserPlus className="size-4 text-muted-foreground" strokeWidth={1.8} />
            Add candidate
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="gap-2.5">
          <Link href="/dashboard/calendars">
            <CalendarPlus className="size-4 text-muted-foreground" strokeWidth={1.8} />
            Schedule interview
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
