"use client";

import Link from "next/link";
import type { Route } from "next";
import {
  Briefcase,
  CalendarPlus,
  FileUp,
  ListTodo,
  Plus,
  UserPlus,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type CreateAction = {
  label: string;
  hint: string;
  icon: LucideIcon;
  href: Route;
  permission: string;
};

// Each link lands on the form itself (`?new=1` opens the drawer/sheet), not
// on a list the recruiter then has to hunt through.
const HIRING: CreateAction[] = [
  {
    label: "Job",
    hint: "Draft and publish a new opening",
    icon: Briefcase,
    href: "/dashboard/jobs/new" as Route,
    permission: "jobs:create",
  },
  {
    label: "Candidate",
    hint: "Add someone by hand, with their CV",
    icon: UserPlus,
    href: "/dashboard/candidates?new=1" as Route,
    permission: "candidates:edit",
  },
  {
    label: "Import candidates",
    hint: "CSV, Greenhouse, Lever, Ashby…",
    icon: FileUp,
    href: "/dashboard/candidates?import=csv" as Route,
    permission: "candidates:edit",
  },
];

const WORK: CreateAction[] = [
  {
    label: "Task",
    hint: "A to-do, optionally tied to a candidate",
    icon: ListTodo,
    href: "/dashboard/tasks?new=1" as Route,
    permission: "tasks:write",
  },
  {
    label: "Interview",
    hint: "Pick a slot on the calendar",
    icon: CalendarPlus,
    href: "/dashboard/calendars" as Route,
    permission: "interviews:manage",
  },
];

function ActionItem({ action }: { action: CreateAction }) {
  const Icon = action.icon;
  return (
    <DropdownMenuItem asChild className="gap-3 rounded-[var(--radius-btn)] px-2 py-2">
      <Link href={action.href}>
        <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-btn)] border border-hairline bg-pure-snow text-near-ink">
          <Icon className="size-4" strokeWidth={1.8} />
        </span>
        <span className="min-w-0">
          <span className="block text-[13.5px] font-medium leading-tight text-near-ink">
            {action.label}
          </span>
          <span className="block truncate text-[12px] leading-tight text-soft-ink">
            {action.hint}
          </span>
        </span>
      </Link>
    </DropdownMenuItem>
  );
}

/**
 * Header "+" — one round ink control (the only solid action in the band) that
 * opens straight into creation flows, filtered by what the viewer may do.
 */
export function QuickCreateButton({
  userPermissions,
  onInvite,
}: {
  userPermissions: string[];
  onInvite?: () => void;
}) {
  const can = (action: CreateAction) => userPermissions.includes(action.permission);
  const hiring = HIRING.filter(can);
  const work = WORK.filter(can);
  if (hiring.length === 0 && work.length === 0 && !onInvite) return null;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger
            aria-label="Create"
            className={cn(
              "inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-near-ink text-pure-snow",
              "transition-[background-color,transform] duration-150 ease-out hover:bg-pine-strong active:scale-95",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink focus-visible:ring-offset-2 focus-visible:ring-offset-warm-paper",
              "data-[state=open]:[&>svg]:rotate-45",
            )}
          >
            <Plus className="size-[18px] transition-transform duration-200 ease-out" strokeWidth={2.25} />
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Create</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" sideOffset={8} className="w-72 p-1.5">
        {hiring.length > 0 ? (
          <>
            <DropdownMenuLabel className="type-col-head px-2 pb-1 pt-1.5">Hiring</DropdownMenuLabel>
            {hiring.map((action) => (
              <ActionItem key={action.label} action={action} />
            ))}
          </>
        ) : null}
        {work.length > 0 ? (
          <>
            {hiring.length > 0 ? <DropdownMenuSeparator className="my-1.5" /> : null}
            <DropdownMenuLabel className="type-col-head px-2 pb-1 pt-1.5">Work</DropdownMenuLabel>
            {work.map((action) => (
              <ActionItem key={action.label} action={action} />
            ))}
          </>
        ) : null}
        {onInvite ? (
          <>
            <DropdownMenuSeparator className="my-1.5" />
            <DropdownMenuItem
              onSelect={onInvite}
              className="gap-3 rounded-[var(--radius-btn)] px-2 py-2"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-btn)] border border-hairline bg-pure-snow text-near-ink">
                <UsersRound className="size-4" strokeWidth={1.8} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-medium leading-tight text-near-ink">
                  Invite teammate
                </span>
                <span className="block truncate text-[12px] leading-tight text-soft-ink">
                  Bring a recruiter or interviewer in
                </span>
              </span>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
