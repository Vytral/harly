"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { ListChecks, X } from "lucide-react";

import { UserAvatar } from "@/components/ui/UserAvatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BriefcaseIcon,
  MagnifyingGlassIcon,
  PlusCircleIcon,
  UserCircleIcon,
} from "@/components/ui/icons/command";
import { allNavItems, hasNavPermission } from "@/components/dashboard/nav-items";
import { useWorkspaceSearch } from "@/features/search/use-workspace-search";
import { presentResults } from "@/features/search/search-controller";
import {
  recentsViewerAction,
  visibleRecentsAction,
} from "@/features/search/actions";
import {
  browserRecentsStorage,
  filterRecentsByPermission,
  purgeLegacyRecents,
  readRecents,
  recentFromHit,
  recordRecent,
  removeRecent,
  sameRecent,
  type RecentSearchItem,
  type RecentsScope,
} from "@/features/search/recents";
import type { SearchGroupKey } from "@/features/search/results";
import type { SearchRange } from "@/features/search/query";
import type { Permission } from "@/features/workspaces/permissions";

/** Id of the header button that opens the palette; focus returns here on close. */
export const COMMAND_MENU_TRIGGER_ID = "command-menu-trigger";

const GROUP_ORDER: readonly SearchGroupKey[] = [
  "jobs",
  "candidates",
  "applications",
  "tasks",
  "people",
];

const GROUP_HEADINGS: Record<SearchGroupKey, string> = {
  jobs: "Jobs",
  candidates: "Candidates",
  applications: "Applications",
  tasks: "Tasks",
  people: "People",
};

const SKELETON_ROWS = 4;

const LIST_CLASSES =
  "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:min-h-11 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2.5 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5";

export function CommandMenu({
  open,
  onOpenChange,
  userPermissions,
  workspaceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userPermissions: Permission[];
  workspaceId: string;
}) {
  // The rail only shows five destinations now, so the palette carries the full
  // index: it is the fast path to everything that moved behind More.
  const navItems = allNavItems().filter((item) =>
    hasNavPermission(item, userPermissions),
  );

  const router = useRouter();
  const { state, controller } = useWorkspaceSearch();
  const [input, setInput] = useState("");
  const [recents, setRecents] = useState<RecentSearchItem[]>([]);
  // Recents are stored per user, and the page does not pass the user id down,
  // so the palette asks the server. Until it answers, no recents show.
  const [viewerId, setViewerId] = useState<string | null>(null);
  const permissionKey = userPermissions.join(",");
  const recentsScope: RecentsScope | null = viewerId
    ? { userId: viewerId, workspaceId }
    : null;

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

  // Every close path (Escape, overlay, a result, ⌘K) flips `open`, so resetting
  // here clears the query and drops any in-flight answer in one place.
  useEffect(() => {
    if (open) return;
    queueMicrotask(() => setInput(""));
    controller.reset();
  }, [open, controller]);

  // Asked on first open, so pages that never open the palette pay nothing.
  useEffect(() => {
    if (!open || viewerId) return;
    let cancelled = false;
    recentsViewerAction()
      .then((result) => {
        if (!cancelled && result.ok) setViewerId(result.userId);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, viewerId]);

  // Each time the palette opens, show this user's recents only when the viewer
  // still has the group's permission and the server confirms each record is
  // still visible. Anything else is removed from storage.
  useEffect(() => {
    if (!open || !viewerId) return;
    const storage = browserRecentsStorage();
    const scope: RecentsScope = { userId: viewerId, workspaceId };
    purgeLegacyRecents(storage, workspaceId);
    const stored = readRecents(storage, scope);
    const permitted = filterRecentsByPermission(
      stored,
      permissionKey.split(","),
    );
    for (const item of stored) {
      if (!permitted.some((kept) => sameRecent(kept, item))) {
        removeRecent(storage, scope, item);
      }
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setRecents([]);
    });
    if (permitted.length > 0) {
      visibleRecentsAction(
        permitted.map(({ group, id }) => ({ group, id })),
      ).then((result) => {
        if (cancelled || !result.ok) return;
        const isVisible = (item: RecentSearchItem) =>
          result.visible.some((ref) => sameRecent(ref, item));
        for (const item of permitted) {
          if (!isVisible(item)) removeRecent(storage, scope, item);
        }
        setRecents(permitted.filter(isVisible));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [open, viewerId, workspaceId, permissionKey]);

  function handleInputChange(value: string) {
    setInput(value);
    controller.setQuery(value);
  }

  function go(href: string) {
    onOpenChange(false);
    router.push(href as Route);
  }

  function openResult(item: RecentSearchItem) {
    if (recentsScope) {
      setRecents(recordRecent(browserRecentsStorage(), recentsScope, item));
    }
    go(item.href);
  }

  function dropRecent(item: RecentSearchItem) {
    if (recentsScope) {
      setRecents(removeRecent(browserRecentsStorage(), recentsScope, item));
    }
  }

  function restoreTriggerFocus(event: Event) {
    const trigger = document.getElementById(COMMAND_MENU_TRIGGER_ID);
    if (!trigger) return;
    event.preventDefault();
    trigger.focus();
  }

  const hasQuery = state.query.length > 0;
  const { results, stale: isStale, busy: isLoading } = presentResults(state);
  const totalHits = results
    ? GROUP_ORDER.reduce(
        (sum, group) => sum + (results.groups[group]?.hits.length ?? 0),
        0,
      )
    : 0;
  const hasResults = totalHits > 0;
  const showSkeleton = hasQuery && isLoading && !results;
  const showRecents = !hasQuery && recents.length > 0;
  const showEmpty = hasQuery && state.status === "ready" && !hasResults;

  const announcement =
    state.status === "error"
      ? (state.error ?? "Search didn't load.")
      : state.status === "loading" && hasQuery
        ? "Searching"
        : hasQuery && state.status === "ready"
          ? `${totalHits} ${totalHits === 1 ? "result" : "results"}`
          : "";

  const seeAllHref =
    results?.allResultsHref ??
    GROUP_ORDER.map((group) => results?.groups[group]?.seeAllHref).find(
      (href): href is string => Boolean(href),
    ) ??
    null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="backdrop-blur-sm"
        onCloseAutoFocus={restoreTriggerFocus}
        className="top-0 left-0 h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 gap-0 rounded-none p-0 shadow-2xl duration-150 motion-reduce:animate-none sm:top-[12%] sm:left-[50%] sm:h-auto sm:max-h-[85dvh] sm:w-full sm:max-w-2xl sm:translate-x-[-50%] sm:translate-y-0 sm:rounded-[28px]"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Search</DialogTitle>
          <DialogDescription>
            Search jobs, candidates, applications, tasks and people, or jump to a page.
          </DialogDescription>
        </DialogHeader>
        <Command
          shouldFilter={false}
          loop
          className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-popover text-popover-foreground"
        >
          <CommandInput
            icon={<MagnifyingGlassIcon className="size-5 shrink-0 text-ink-soft" />}
            placeholder="Search jobs, candidates, tasks, or jump to…"
            value={input}
            onValueChange={handleInputChange}
            className="text-base"
          />
          <CommandList
            aria-busy={isLoading}
            className={`min-h-0 flex-1 max-h-none p-2 sm:max-h-[min(460px,60vh)] ${LIST_CLASSES}`}
          >
            {hasQuery && state.status === "error" ? (
              <div
                role="alert"
                className="flex items-center justify-between gap-3 px-2 pt-3 pb-1 text-sm"
              >
                <span className="text-muted-foreground">{state.error}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => controller.retry()}
                >
                  Retry
                </Button>
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

            {showRecents ? (
              <CommandGroup heading="Recent">
                {recents.map((item) => (
                  <div key={`${item.group}:${item.id}`} className="group relative">
                    <CommandItem
                      value={`recent-${item.group}-${item.id}`}
                      onSelect={() => openResult(item)}
                      className="gap-3 rounded-2xl pe-12"
                    >
                      <ResultIcon group={item.group} name={item.primary} />
                      <ResultText
                        primary={item.primary}
                        secondary={null}
                        highlight={[]}
                      />
                    </CommandItem>
                    <button
                      type="button"
                      aria-label={`Remove ${item.primary} from recent searches`}
                      onClick={() => dropRecent(item)}
                      className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <X className="size-4" strokeWidth={1.8} />
                    </button>
                  </div>
                ))}
              </CommandGroup>
            ) : null}

            {!showSkeleton && results ? (
              <div
                className={
                  isStale
                    ? "opacity-60 transition-opacity duration-150 motion-reduce:transition-none"
                    : undefined
                }
              >
                {GROUP_ORDER.map((group) => {
                  const section = results.groups[group];
                  if (!section || section.hits.length === 0) return null;
                  return (
                    <CommandGroup key={group} heading={GROUP_HEADINGS[group]}>
                      {section.hits.map((hit) => {
                        const content = (
                          <>
                            <ResultIcon
                              group={hit.group}
                              name={hit.primary}
                              avatarUrl={hit.avatarUrl}
                            />
                            <ResultText
                              primary={hit.primary}
                              secondary={hit.secondary}
                              highlight={hit.highlight}
                            />
                          </>
                        );
                        // Stale rows are plain elements: cmdk never registers them,
                        // so Enter cannot choose a row from an earlier query.
                        return isStale ? (
                          <div
                            key={`${hit.group}:${hit.id}`}
                            className="flex items-center gap-3 rounded-2xl px-2 py-2.5"
                          >
                            {content}
                          </div>
                        ) : (
                          <CommandItem
                            key={`${hit.group}:${hit.id}`}
                            value={`${hit.group}-${hit.id}`}
                            onSelect={() => openResult(recentFromHit(hit))}
                            className="gap-3 rounded-2xl"
                          >
                            {content}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  );
                })}
              </div>
            ) : null}

            {showEmpty ? (
              <div className="spotlight-item-enter px-2 pt-3 pb-2 text-sm">
                <p className="text-muted-foreground">
                  No matches for &ldquo;{state.query}&rdquo;.
                </p>
                <ul className="mt-2 list-disc space-y-1 ps-5 text-muted-foreground">
                  <li>Check the spelling, or use fewer words.</li>
                  <li>Search by a candidate&rsquo;s name or email, or by a job title.</li>
                  <li>Tasks match on their title.</li>
                </ul>
              </div>
            ) : null}

            {hasQuery && hasResults && seeAllHref && !isStale ? (
              <CommandGroup>
                <CommandItem
                  value="see-all-results"
                  onSelect={() => go(seeAllHref)}
                  className="gap-3 rounded-2xl"
                >
                  <MagnifyingGlassIcon className="size-4 shrink-0 text-ink-soft" />
                  See all results for &ldquo;{state.query}&rdquo;
                </CommandItem>
              </CommandGroup>
            ) : null}

            {showRecents || hasResults || showEmpty ? (
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

          <p aria-live="polite" className="sr-only">
            {announcement}
          </p>

          <div className="hidden items-center gap-3 border-t px-4 py-2.5 text-xs text-muted-foreground sm:flex">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> navigate
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd> select
            </span>
            <span className="ms-auto flex items-center gap-1">
              <Kbd>esc</Kbd> close
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function ResultIcon({
  group,
  name,
  avatarUrl = null,
}: {
  group: SearchGroupKey;
  name: string;
  avatarUrl?: string | null;
}) {
  if (group === "jobs") {
    return (
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sage">
        <BriefcaseIcon className="text-sage-ink" />
      </span>
    );
  }
  if (group === "tasks") {
    return (
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-kraft">
        <ListChecks className="size-4 text-ink-soft" strokeWidth={1.8} />
      </span>
    );
  }
  return (
    <UserAvatar
      name={name}
      src={avatarUrl}
      size="sm"
      className="size-9 shrink-0 text-sm"
    />
  );
}

function ResultText({
  primary,
  secondary,
  highlight,
}: {
  primary: string;
  secondary: string | null;
  highlight: SearchRange[];
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <span className="truncate font-medium">
        <Highlighted text={primary} ranges={highlight} />
      </span>
      {secondary ? (
        <span className="truncate text-xs text-muted-foreground">{secondary}</span>
      ) : null}
    </div>
  );
}

function Highlighted({ text, ranges }: { text: string; ranges: SearchRange[] }) {
  if (ranges.length === 0) return <>{text}</>;
  const parts: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.start > cursor) parts.push(text.slice(cursor, range.start));
    parts.push(
      <mark
        key={index}
        className="rounded-[4px] bg-sage-wash px-0.5 font-semibold text-foreground"
      >
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border bg-kraft px-1.5 font-mono text-[0.7rem] font-medium text-ink-soft">
      {children}
    </kbd>
  );
}
