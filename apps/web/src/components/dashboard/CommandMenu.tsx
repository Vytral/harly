"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

import { searchWorkspaceAction } from "@/features/search/actions";
import type { SearchResults } from "@/features/search/data";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  BriefcaseIcon,
  MagnifyingGlassIcon,
  PlusCircleIcon,
  UserCircleIcon,
} from "@/components/ui/icons/command";
import { allNavItems, hasNavPermission } from "@/components/dashboard/nav-items";
import type { Permission } from "@/features/workspaces/permissions";

const emptyResults: SearchResults = { jobs: [], candidates: [] };

const SKELETON_ROWS = 4;

export function CommandMenu({
  open,
  onOpenChange,
  userPermissions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userPermissions: Permission[];
}) {
  // The rail only shows five destinations now, so the palette carries the full
  // index , it is the fast path to everything that moved behind More.
  const navItems = allNavItems().filter((item) =>
    hasNavPermission(item, userPermissions),
  );

  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(emptyResults);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

    // Reset to a clean slate every time the palette opens.
  useEffect(() => {
    if (!open) {
      queueMicrotask(() => {
        setQuery("");
        setResults(emptyResults);
        setLoading(false);
      });
    }
  }, [open]);

  // Debounced workspace search.  
  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const next = await searchWorkspaceAction(q);
      if (!cancelled) {
        setResults(next);
        setLoading(false);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (value.trim().length < 1) {
      setResults(emptyResults);
      setLoading(false);
      return;
    }
    setLoading(true);
  }

  function go(href: string) {
    onOpenChange(false);
    setQuery("");
    router.push(href as Route);
  }

  const hasQuery = query.trim().length > 0;
  const hasResults = results.jobs.length > 0 || results.candidates.length > 0;
  const showSkeleton = hasQuery && loading && !hasResults;

  return (
        <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      shouldFilter={false}
      showCloseButton={false}
      overlayClassName="backdrop-blur-sm"
      className="top-[12%] max-w-xl translate-y-0 gap-0 rounded-[28px] p-0 shadow-2xl sm:max-w-2xl"
    >
      <CommandInput
        icon={<MagnifyingGlassIcon className="size-5 shrink-0 text-ink-soft" />}
        placeholder="Search jobs, candidates, or jump to…"
        value={query}
        onValueChange={handleQueryChange}
        className="text-base"
      />
      <CommandList className="max-h-[min(420px,60vh)] p-2">
        {hasQuery && !hasResults && !loading ? (
          <div className="spotlight-item-enter px-2 pt-3 pb-1 text-sm text-ink-soft">
            No results for &ldquo;{query}&rdquo;.
          </div>
        ) : null}

        {showSkeleton ? (
          <div className="space-y-1 p-1">
            {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
              <div
                key={i}
                className="spotlight-item-enter flex items-center gap-3 rounded-2xl px-2 py-2.5"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <Skeleton className="size-9 shrink-0 rounded-xl" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-1/3 rounded-full" />
                  <Skeleton className="h-3 w-1/2 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {!showSkeleton && results.jobs.length > 0 ? (
          <CommandGroup heading="Jobs">
            {results.jobs.map((job, i) => (
              <CommandItem
                key={job.id}
                value={`job-${job.id}`}
                onSelect={() => go(`/dashboard/jobs/${job.id}`)}
                className="spotlight-item-enter gap-3 rounded-2xl"
                style={{ animationDelay: `${i * 30}ms` }}
              >
               <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sage">
                  <BriefcaseIcon className="text-sage-ink" />
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{job.title}</span>
                  {job.department ? (
                    <span className="truncate text-xs text-ink-soft">
                      {job.department}
                    </span>
                  ) : null}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {!showSkeleton && results.candidates.length > 0 ? (
          <CommandGroup heading="Candidates">
            {results.candidates.map((candidate, i) => (
              <CommandItem
                key={candidate.id}
                value={`candidate-${candidate.id}`}
                onSelect={() => go(`/dashboard/candidates/${candidate.id}`)}
                className="spotlight-item-enter gap-3 rounded-2xl"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <UserAvatar
                  name={candidate.name}
                  src={candidate.avatarUrl}
                  size="sm"
                  className="size-9 shrink-0 text-sm"
                />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{candidate.name}</span>
                  <span className="truncate text-xs text-ink-soft">
                    {candidate.headline ?? candidate.email}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {!showSkeleton && !hasResults ? (
          <CommandSeparator className="my-2" />
        ) : null}

         {!showSkeleton ? (
          <>
            <CommandGroup heading="Navigate">
              {navItems.map((item) => (
                <CommandItem
                  key={item.href}
                  value={`nav-${item.label}`}
                  onSelect={() => go(item.href)}
                  className="gap-3 rounded-2xl"
                >
                  <item.icon className="size-4" strokeWidth={1.8} />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Actions">
              <CommandItem
                value="action-new-job"
                onSelect={() => go("/dashboard/jobs/new")}
                className="gap-3 rounded-2xl"
              >
                <PlusCircleIcon />
                Create new job
              </CommandItem>
              <CommandItem
                value="action-account"
                onSelect={() => go("/account")}
                className="gap-3 rounded-2xl"
              >
                <UserCircleIcon />
                Account settings
              </CommandItem>
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
      <div className="flex items-center gap-3 border-t px-4 py-2.5 text-xs text-ink-soft">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> navigate
        </span>
        <span className="flex items-center gap-1">
          <Kbd>↵</Kbd> select
        </span>
        <span className="ml-auto flex items-center gap-1">
          <Kbd>esc</Kbd> close
        </span>
      </div>
    </CommandDialog>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border bg-kraft px-1.5 font-mono text-[0.7rem] font-medium text-ink-soft">
      {children}
    </kbd>
  );
}
