"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  Briefcase,
  KanbanSquare,
  LayoutDashboard,
  Plus,
  Settings,
  User,
  Users,
} from "lucide-react";

import {
  searchWorkspaceAction,
  type SearchResults,
} from "@/features/search/actions";
import { UserAvatar } from "@/components/ui/UserAvatar";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

const navItems = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Jobs", href: "/dashboard/jobs", icon: Briefcase },
  { label: "Pipeline", href: "/dashboard/pipeline", icon: KanbanSquare },
  { label: "Candidates", href: "/dashboard/candidates", icon: Users },
  { label: "Settings", href: "/settings", icon: Settings },
] as const;

const emptyResults: SearchResults = { jobs: [], candidates: [] };

export function CommandMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
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
    }, 200);
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

  const hasResults =
    results.jobs.length > 0 || results.candidates.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <CommandInput
        placeholder="Search jobs, candidates, or jump to…"
        value={query}
        onValueChange={handleQueryChange}
      />
      <CommandList>
        {query.trim().length > 0 && !hasResults && !loading ? (
          <CommandEmpty>No results found.</CommandEmpty>
        ) : null}

        {results.jobs.length > 0 ? (
          <CommandGroup heading="Jobs">
            {results.jobs.map((job) => (
              <CommandItem
                key={job.id}
                value={`job-${job.id}`}
                onSelect={() => go(`/dashboard/jobs/${job.id}`)}
              >
                <Briefcase />
                {job.title}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {results.candidates.length > 0 ? (
          <CommandGroup heading="Candidates">
            {results.candidates.map((candidate) => (
              <CommandItem
                key={candidate.id}
                value={`candidate-${candidate.id}`}
                onSelect={() => go(`/dashboard/candidates/${candidate.id}`)}
              >
                <UserAvatar name={candidate.name} size="sm" className="size-5" />
                <span>{candidate.name}</span>
                <span className="ml-auto truncate text-xs text-muted-foreground">
                  {candidate.email}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {hasResults ? <CommandSeparator /> : null}

        <CommandGroup heading="Navigate">
          {navItems.map((item) => (
            <CommandItem
              key={item.href}
              value={`nav-${item.label}`}
              onSelect={() => go(item.href)}
            >
              <item.icon />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Actions">
          <CommandItem
            value="action-new-job"
            onSelect={() => go("/dashboard/jobs/new")}
          >
            <Plus />
            Create new job
          </CommandItem>
          <CommandItem
            value="action-account"
            onSelect={() => go("/settings/account")}
          >
            <User />
            Account settings
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
