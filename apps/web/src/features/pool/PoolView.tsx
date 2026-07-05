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
import { toast } from "sonner";

import { removeFromPoolAction, bulkRemoveFromPoolAction } from "@/features/pool/actions";
import type { PoolCandidate } from "@/features/pool/data";
import { AssignToJobModal } from "@/features/pool/AssignToJobModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { cn } from "@/lib/utils";

const SOURCE_META: Record<string, { label: string; className: string }> = {
  applied: { label: "Applied", className: "bg-blue-500/10 text-blue-600" },
  imported: { label: "Imported", className: "bg-purple-500/10 text-purple-600" },
  sourced: { label: "Sourced", className: "bg-emerald-500/10 text-emerald-600" },
  referred: { label: "Referred", className: "bg-amber-500/10 text-amber-600" },
};

const RECOMMENDATION_META: Record<string, { label: string; className: string }> = {
  strong_yes: { label: "Strong yes", className: "bg-primary/10 text-primary" },
  yes: { label: "Yes", className: "bg-primary/10 text-primary" },
  maybe: { label: "Maybe", className: "bg-clay/15 text-clay" },
  no: { label: "No", className: "bg-destructive/10 text-destructive" },
};

function scoreTone(score: number) {
  if (score >= 60) return "text-primary";
  if (score >= 40) return "text-clay";
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

  if (candidates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Bookmark className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-1">No candidates in pool</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Add candidates to the pool from their profile or the candidates list to
          keep them available for future roles.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or skill..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {/* Source filter dropdown */}
        <div className="relative">
          <button
            onClick={() => setSourceOpen(!sourceOpen)}
            className={cn(
              "flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors",
              sourceFilter !== "all"
                ? "border-primary/40 bg-primary/5 text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-muted",
            )}
          >
            Source
            <ChevronDown className={cn("h-4 w-4 transition-transform", sourceOpen && "rotate-180")} />
          </button>
          {sourceOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setSourceOpen(false)} />
              <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-xl border bg-popover p-1.5 shadow-md">
                <button
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
                <Briefcase className="h-4 w-4 mr-1.5" />
                Assign to Job
              </Button>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={bulkRemove}
              disabled={isPending}
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Remove
            </Button>
          </div>
        )}
        <div className="ml-auto text-sm text-muted-foreground">
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
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="w-10 px-3 py-2.5">
                <Checkbox
                  checked={selectedIds.size === filtered.length && filtered.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
              </th>
              <th className="text-left px-3 py-2.5 font-medium">Candidate</th>
              <th className="text-left px-3 py-2.5 font-medium">Skills</th>
              <th className="text-left px-3 py-2.5 font-medium">Score</th>
              <th className="text-left px-3 py-2.5 font-medium">Source</th>
              <th className="text-left px-3 py-2.5 font-medium">Added</th>
              <th className="w-10 px-3 py-2.5" />
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
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1 max-w-[240px]">
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
                </td>
                <td className="px-3 py-3">
                  {candidate.bestScore != null ? (
                    <div className="flex items-center gap-1.5">
                      <span className={cn("font-medium", scoreTone(candidate.bestScore))}>
                        {candidate.bestScore}
                      </span>
                      {candidate.bestRecommendation && (
                        <Badge
                          className={cn(
                            "text-xs",
                            RECOMMENDATION_META[candidate.bestRecommendation]?.className,
                          )}
                        >
                          {RECOMMENDATION_META[candidate.bestRecommendation]?.label}
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <Badge className={cn("text-xs", SOURCE_META[candidate.source]?.className)}>
                    {SOURCE_META[candidate.source]?.label ?? candidate.source}
                  </Badge>
                </td>
                <td className="px-3 py-3 text-muted-foreground whitespace-nowrap" suppressHydrationWarning>
                  {new Date(candidate.addedAt).toLocaleDateString()}
                </td>
                <td className="px-3 py-3">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" className="h-8 w-8 border-border/60 text-muted-foreground hover:text-foreground">
                        <MoreHorizontal className="h-4 w-4" />
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
                          <DropdownMenuItem
                            onClick={() =>
                              setAssignModal({
                                open: true,
                                candidateId: candidate.candidateId,
                                candidateName: `${candidate.firstName} ${candidate.lastName}`,
                                candidateEmail: candidate.email,
                              })
                            }
                          >
                            <Briefcase className="h-4 w-4 mr-2" />
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
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remove from pool
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
