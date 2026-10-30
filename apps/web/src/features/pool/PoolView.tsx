"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bookmark,
  Briefcase,
  ChevronDown,
  MoreHorizontal,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import { removeFromPoolAction, bulkRemoveFromPoolAction } from "@/features/pool/actions";
import type { PoolCandidate } from "@/features/pool/data";
import { AssignToJobModal } from "@/features/pool/AssignToJobModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { StatusPill, type StatusPillTone } from "@/components/ui/status-pill";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { cn } from "@/lib/utils";

const SOURCE_META: Record<string, { label: string; tone: StatusPillTone }> = {
  applied: { label: "Applied", tone: "info" },
  imported: { label: "Imported", tone: "neutral" },
  sourced: { label: "Sourced", tone: "success" },
  referred: { label: "Referred", tone: "warning" },
};

const RECOMMENDATION_META: Record<string, { label: string; className: string }> = {
  strong_yes: { label: "Strong yes", className: "bg-primary/10 text-primary" },
  yes: { label: "Yes", className: "bg-primary/10 text-primary" },
  maybe: { label: "Maybe", className: "bg-warning/15 text-warning" },
  no: { label: "No", className: "bg-destructive/10 text-destructive" },
};

function scoreTone(score: number) {
  if (score >= 60) return "text-primary";
  if (score >= 40) return "text-warning";
  return "text-destructive";
}

type PoolViewProps = {
  candidates: PoolCandidate[];
  openJobs?: Array<{ id: string; title: string; department: string | null; location: string | null }>;
};

export function PoolView({ candidates, openJobs = [] }: PoolViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assignModal, setAssignModal] = useState<{
    open: boolean;
    candidateId: string;
    candidateName: string;
    candidateEmail: string;
  }>({ open: false, candidateId: "", candidateName: "", candidateEmail: "" });
  const [bulkAssignModal, setBulkAssignModal] = useState(false);

  // Extract unique sources from candidates
  const allSources = useMemo(() => {
    const sourceSet = new Set<string>();
    for (const c of candidates) sourceSet.add(c.source);
    return Array.from(sourceSet).sort();
  }, [candidates]);

  const filtered = useMemo(() => {
    let result = candidates;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.firstName.toLowerCase().includes(q) ||
          c.lastName.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.skills.some((s) => s.toLowerCase().includes(q)),
      );
    }

    if (sourceFilter !== "all") {
      result = result.filter((c) => c.source === sourceFilter);
    }

    return result;
  }, [candidates, search, sourceFilter]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((c) => c.candidateId)));
    }
  }

  function removeCandidate(candidateId: string) {
    startTransition(async () => {
      const result = await removeFromPoolAction({ candidateId });
      if (!result.success) {
        toast.error(result.error ?? "Could not remove from pool.");
        return;
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(candidateId);
        return next;
      });
      toast.success("Removed from pool.");
      router.refresh();
    });
  }

  function bulkRemove() {
    if (selectedIds.size === 0) return;
    startTransition(async () => {
      const result = await bulkRemoveFromPoolAction({
        candidateIds: Array.from(selectedIds),
      });
      if (!result.success) {
        toast.error(result.error ?? "Could not remove candidates.");
        return;
      }
      setSelectedIds(new Set());
      toast.success(`Removed ${selectedIds.size} candidate${selectedIds.size === 1 ? "" : "s"} from pool.`);
      router.refresh();
    });
  }

  function openAssignModal(candidate: PoolCandidate) {
    setAssignModal({
      open: true,
      candidateId: candidate.candidateId,
      candidateName: `${candidate.firstName} ${candidate.lastName}`,
      candidateEmail: candidate.email,
    });
  }

  if (candidates.length === 0) {
    return (
      <EmptyState
        icon={Bookmark}
        title="No candidates in pool"
        description="Add candidates to the pool from their profile or the candidates list to keep them available for future roles."
      />
    );
  }

  function renderSource(candidate: PoolCandidate) {
    const meta = SOURCE_META[candidate.source];
    return (
      <StatusPill tone={meta?.tone ?? "neutral"} size="sm">
        {meta?.label ?? candidate.source}
      </StatusPill>
    );
  }

  function renderScore(candidate: PoolCandidate) {
    if (candidate.bestScore == null) {
      return <span className="text-muted-foreground">Not scored</span>;
    }
    return (
      <div className="flex items-center gap-1.5">
        <span className={cn("font-medium", scoreTone(candidate.bestScore))}>
          {candidate.bestScore}
        </span>
        {candidate.bestRecommendation ? (
          <Badge
            className={cn(
              "text-xs",
              RECOMMENDATION_META[candidate.bestRecommendation]?.className,
            )}
          >
            {RECOMMENDATION_META[candidate.bestRecommendation]?.label}
          </Badge>
        ) : null}
      </div>
    );
  }

  function renderSkills(candidate: PoolCandidate) {
    return (
      <div className="flex flex-wrap gap-1">
        {candidate.skills.slice(0, 3).map((skill) => (
          <Badge key={skill} variant="secondary" className="text-xs">
            {skill}
          </Badge>
        ))}
        {candidate.skills.length > 3 && (
          <Badge variant="outline" className="text-xs">
            +{candidate.skills.length - 3}
          </Badge>
        )}
      </div>
    );
  }

  function renderRowActions(candidate: PoolCandidate) {
    const name = `${candidate.firstName} ${candidate.lastName}`;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            aria-label={`Actions for ${name}`}
            className="h-8 w-8 border-border/60 text-muted-foreground hover:text-foreground"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/candidates/${candidate.candidateId}`}>
              View profile
            </Link>
          </DropdownMenuItem>
          {openJobs.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => openAssignModal(candidate)}>
                <Briefcase className="h-4 w-4 mr-2" aria-hidden="true" />
                Assign to Job
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => removeCandidate(candidate.candidateId)}
            disabled={isPending}
          >
            <Trash2 className="h-4 w-4 mr-2" aria-hidden="true" />
            Remove from pool
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            aria-label="Search the pool"
            placeholder="Search by name, email, or skill..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {/* Source filter dropdown */}
        <div className="relative">
          <button
            type="button"
            aria-expanded={sourceOpen}
            aria-haspopup="menu"
            onClick={() => setSourceOpen(!sourceOpen)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setSourceOpen(false);
            }}
            className={cn(
              "flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors",
              sourceFilter !== "all"
                ? "border-primary/40 bg-primary/5 text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-muted",
            )}
          >
            Source
            <ChevronDown className={cn("h-4 w-4 transition-transform motion-reduce:transition-none", sourceOpen && "rotate-180")} aria-hidden="true" />
          </button>
          {sourceOpen && (
            <>
              <div className="fixed inset-0 z-40" aria-hidden="true" onClick={() => setSourceOpen(false)} />
              <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-xl border bg-popover p-1.5 shadow-md">
                <button
                  type="button"
                  onClick={() => { setSourceFilter("all"); setSourceOpen(false); }}
                  className={cn(
                    "flex w-full items-center rounded-lg px-3 py-2 text-sm transition-colors",
                    sourceFilter === "all"
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  All sources
                </button>
                {allSources.map((src) => (
                  <button
                    type="button"
                    key={src}
                    onClick={() => { setSourceFilter(src); setSourceOpen(false); }}
                    className={cn(
                      "flex w-full items-center rounded-lg px-3 py-2 text-sm transition-colors",
                      sourceFilter === src
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {SOURCE_META[src]?.label ?? src}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {selectedIds.size} selected
            </span>
            {openJobs.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBulkAssignModal(true)}
                disabled={isPending}
              >
                <Briefcase className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Assign to Job
              </Button>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={bulkRemove}
              disabled={isPending}
            >
              <Trash2 className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Remove
            </Button>
          </div>
        )}
        <div className="text-sm text-muted-foreground sm:ml-auto">
          {filtered.length} candidate{filtered.length === 1 ? "" : "s"}
        </div>
        {(search || sourceFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setSourceFilter("all");
            }}
          >
            <X className="h-4 w-4 mr-1" aria-hidden="true" />
            Clear
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          variant="filtered"
          icon={Search}
          title="No candidates match these filters"
          description="Try a different name, email, skill, or source."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("");
                setSourceFilter("all");
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : null}

      {/* Wide screens: a table inside an overflow container, so it scrolls
          sideways instead of breaking the page. */}
      {filtered.length > 0 ? (
        <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-muted-foreground">
                <th scope="col" className="w-10 px-3 py-2.5">
                  <Checkbox
                    aria-label="Select all candidates"
                    checked={selectedIds.size === filtered.length && filtered.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </th>
                <th scope="col" className="text-left px-3 py-2.5 font-medium">Candidate</th>
                <th scope="col" className="text-left px-3 py-2.5 font-medium">Skills</th>
                <th scope="col" className="text-left px-3 py-2.5 font-medium">Score</th>
                <th scope="col" className="text-left px-3 py-2.5 font-medium">Source</th>
                <th scope="col" className="text-left px-3 py-2.5 font-medium">Added</th>
                <th scope="col" className="w-10 px-3 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((candidate) => (
                <tr
                  key={candidate.candidateId}
                  className={cn(
                    "border-b last:border-b-0 hover:bg-muted/30 transition-colors",
                    selectedIds.has(candidate.candidateId) && "bg-muted/50",
                  )}
                >
                  <td className="px-3 py-3">
                    <Checkbox
                      aria-label={`Select ${candidate.firstName} ${candidate.lastName}`}
                      checked={selectedIds.has(candidate.candidateId)}
                      onCheckedChange={() => toggleSelect(candidate.candidateId)}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <Link
                      href={`/dashboard/candidates/${candidate.candidateId}`}
                      className="flex items-center gap-3 hover:underline"
                    >
                      <UserAvatar
                        name={`${candidate.firstName} ${candidate.lastName}`}
                        src={candidate.avatarUrl}
                        fallbackSrcs={candidate.avatarFallbackSrcs}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {candidate.firstName} {candidate.lastName}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {candidate.email}
                        </div>
                        {candidate.headline && (
                          <div className="text-xs text-muted-foreground truncate mt-0.5">
                            {candidate.headline}
                          </div>
                        )}
                      </div>
                    </Link>
                  </td>
                  <td className="px-3 py-3 max-w-[240px]">{renderSkills(candidate)}</td>
                  <td className="px-3 py-3">{renderScore(candidate)}</td>
                  <td className="px-3 py-3">{renderSource(candidate)}</td>
                  <td className="px-3 py-3 text-muted-foreground whitespace-nowrap" suppressHydrationWarning>
                    {new Date(candidate.addedAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-3">{renderRowActions(candidate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Narrow screens: one stacked card per candidate. */}
      {filtered.length > 0 ? (
        <ul className="divide-y rounded-xl border bg-card md:hidden">
          {filtered.map((candidate) => (
            <li
              key={candidate.candidateId}
              className={cn(
                "flex items-start gap-3 p-4",
                selectedIds.has(candidate.candidateId) && "bg-muted/50",
              )}
            >
              <Checkbox
                className="mt-1"
                aria-label={`Select ${candidate.firstName} ${candidate.lastName}`}
                checked={selectedIds.has(candidate.candidateId)}
                onCheckedChange={() => toggleSelect(candidate.candidateId)}
              />
              <div className="min-w-0 flex-1 space-y-2">
                <Link
                  href={`/dashboard/candidates/${candidate.candidateId}`}
                  className="flex min-w-0 items-center gap-3"
                >
                  <UserAvatar
                    name={`${candidate.firstName} ${candidate.lastName}`}
                    src={candidate.avatarUrl}
                    fallbackSrcs={candidate.avatarFallbackSrcs}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {candidate.firstName} {candidate.lastName}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {candidate.email}
                    </div>
                  </div>
                </Link>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {renderScore(candidate)}
                  {renderSource(candidate)}
                </div>
                {candidate.skills.length > 0 ? renderSkills(candidate) : null}
                <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                  Added {new Date(candidate.addedAt).toLocaleDateString()}
                </p>
              </div>
              {renderRowActions(candidate)}
            </li>
          ))}
        </ul>
      ) : null}

      <AssignToJobModal
        open={assignModal.open}
        onOpenChange={(open) => setAssignModal((prev) => ({ ...prev, open }))}
        candidateId={assignModal.candidateId}
        candidateName={assignModal.candidateName}
        candidateEmail={assignModal.candidateEmail}
        jobs={openJobs}
      />

      {/* Bulk Assign Modal */}
      {bulkAssignModal && (
        <AssignToJobModal
          open={bulkAssignModal}
          onOpenChange={(open) => {
            setBulkAssignModal(open);
            if (!open) setSelectedIds(new Set());
          }}
          candidateId={Array.from(selectedIds)[0] ?? ""}
          candidateName={`${selectedIds.size} candidates`}
          candidateEmail=""
          jobs={openJobs}
          isBulk
          bulkCandidateIds={Array.from(selectedIds)}
        />
      )}
    </div>
  );
}
