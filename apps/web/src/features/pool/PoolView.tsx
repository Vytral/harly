"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bookmark,
  Briefcase,
  MoreHorizontal,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
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
import {
  BulkAction,
  BulkActionBar,
  DirectoryCard,
  FilterBar,
  FilterChip,
  FilterCountButton,
  SearchPill,
  TotalLine,
  dirTable,
  dirTd,
  dirTh,
  dirTr,
} from "@/features/candidates/directory-chrome";
import { StatusPill, type StatusPillTone } from "@/components/ui/status-pill";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { cn } from "@/lib/utils";
import { scoreBand } from "@/lib/evaluation/score-band";

const SOURCE_TONE: Record<string, StatusPillTone> = {
  applied: "info",
  imported: "neutral",
  sourced: "success",
  referred: "warning",
};

const RECOMMENDATION_CLASS: Record<string, string> = {
  strong_yes: "bg-primary/10 text-primary",
  yes: "bg-primary/10 text-primary",
  maybe: "bg-warning/15 text-warning",
  no: "bg-destructive/10 text-destructive",
};

type PoolT = ReturnType<typeof useTranslations>;

function hasKey(map: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(map, key);
}

function sourceLabel(t: PoolT, source: string): string {
  return hasKey(SOURCE_TONE, source) ? t(`sources.${source}`) : source;
}

function recommendationLabel(t: PoolT, recommendation: string): string | undefined {
  return hasKey(RECOMMENDATION_CLASS, recommendation)
    ? t(`recommendations.${recommendation}`)
    : undefined;
}

function scoreTone(score: number) {
  switch (scoreBand(score)) {
    case "strong":
      return "text-success-olive";
    case "good":
      return "text-primary";
    case "mixed":
      return "text-warning";
    default:
      return "text-destructive";
  }
}

type PoolViewProps = {
  candidates: PoolCandidate[];
  openJobs?: Array<{ id: string; title: string; department: string | null; location: string | null }>;
};

export function PoolView({ candidates, openJobs = [] }: PoolViewProps) {
  const t = useTranslations("features.pool.PoolView");
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
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
        toast.error(result.error ?? t("couldNotRemove"));
        return;
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(candidateId);
        return next;
      });
      toast.success(t("removed"));
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
        toast.error(result.error ?? t("couldNotRemoveCandidates"));
        return;
      }
      setSelectedIds(new Set());
      toast.success(t("bulkRemoved", { count: selectedIds.size }));
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
        title={t("emptyTitle")}
        description={t("emptyDescription")}
      />
    );
  }

  function renderSource(candidate: PoolCandidate) {
    return (
      <StatusPill tone={SOURCE_TONE[candidate.source] ?? "neutral"} size="sm">
        {sourceLabel(t, candidate.source)}
      </StatusPill>
    );
  }

  function renderScore(candidate: PoolCandidate) {
    if (candidate.bestScore == null) {
      return <span className="text-[13px] text-quiet-mist">{t("notScored")}</span>;
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
              RECOMMENDATION_CLASS[candidate.bestRecommendation],
            )}
          >
            {recommendationLabel(t, candidate.bestRecommendation)}
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
            variant="ghost"
            size="icon-sm"
            aria-label={t("actionsFor", { name })}
            className="text-soft-ink hover:text-near-ink"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/candidates/${candidate.candidateId}`}>
              {t("viewProfile")}
            </Link>
          </DropdownMenuItem>
          {openJobs.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => openAssignModal(candidate)}>
                <Briefcase className="h-4 w-4 mr-2" aria-hidden="true" />
                {t("assignToJob")}
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
            {t("removeFromPool")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const clearFilters = () => {
    setSearch("");
    setSourceFilter("all");
  };
  const filtersActive = Boolean(search) || sourceFilter !== "all";
  const allSelected = selectedIds.size === filtered.length && filtered.length > 0;

  return (
    <>
      <DirectoryCard>
        <FilterBar>
          <SearchPill
            value={search}
            onChange={setSearch}
            placeholder={t("searchPlaceholder")}
            label={t("searchLabel")}
          />
          <FilterCountButton count={sourceFilter !== "all" ? 1 : 0} onClear={clearFilters} />
          <FilterChip
            label={t("sourceFilter")}
            value={sourceFilter}
            onChange={setSourceFilter}
            options={allSources}
            labelMap={Object.fromEntries(
              allSources.map((src) => [src, sourceLabel(t, src)]),
            )}
            allValue="all"
          />
          {filtersActive ? (
            <Button variant="ghost" size="sm" className="rounded-full text-soft-ink" onClick={clearFilters}>
              <X className="size-4" aria-hidden="true" />
              {t("clear")}
            </Button>
          ) : null}
        </FilterBar>

        <TotalLine total={filtered.length} noun={t("nounSingular")} pluralNoun={t("nounPlural")} />

        {filtered.length === 0 ? (
          <EmptyState
            variant="filtered"
            icon={Search}
            title={t("noMatchTitle")}
            description={t("noMatchDescription")}
            action={
              <Button variant="outline" size="sm" onClick={clearFilters}>
                {t("clearFilters")}
              </Button>
            }
          />
        ) : (
          <>
            {/* Wide screens: a table inside an overflow container, so it scrolls
                sideways instead of breaking the page. */}
            <div className="relative hidden overflow-x-auto md:block">
              <table className={dirTable}>
                <thead>
                  <tr>
                    <th scope="col" className={cn(dirTh, "w-12")}>
                      <Checkbox
                        aria-label={t("selectAll")}
                        checked={allSelected}
                        onCheckedChange={toggleSelectAll}
                      />
                    </th>
                    <th scope="col" className={dirTh}>{t("headers.candidate")}</th>
                    <th scope="col" className={dirTh}>{t("headers.skills")}</th>
                    <th scope="col" className={dirTh}>{t("headers.score")}</th>
                    <th scope="col" className={dirTh}>{t("headers.source")}</th>
                    <th scope="col" className={dirTh}>{t("headers.added")}</th>
                    <th scope="col" className={cn(dirTh, "w-14")}>
                      <span className="sr-only">{t("headers.actions")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((candidate) => {
                    const name = `${candidate.firstName} ${candidate.lastName}`;
                    return (
                      <tr
                        key={candidate.candidateId}
                        data-state={selectedIds.has(candidate.candidateId) ? "selected" : undefined}
                        className={dirTr}
                      >
                        <td className={dirTd}>
                          <Checkbox
                            aria-label={t("selectCandidate", { name })}
                            checked={selectedIds.has(candidate.candidateId)}
                            onCheckedChange={() => toggleSelect(candidate.candidateId)}
                          />
                        </td>
                        <td className={cn(dirTd, "py-2")}>
                          <Link
                            href={`/dashboard/candidates/${candidate.candidateId}`}
                            className="flex items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
                          >
                            <UserAvatar
                              name={name}
                              src={candidate.avatarUrl}
                              fallbackSrcs={candidate.avatarFallbackSrcs}
                              size="lg"
                            />
                            <div className="min-w-0">
                              <div className="truncate text-[14.5px] font-medium text-near-ink group-hover/row:underline">
                                {name}
                              </div>
                              <div className="truncate text-[13px] text-soft-ink">
                                {candidate.headline || candidate.email}
                              </div>
                            </div>
                          </Link>
                        </td>
                        <td className={cn(dirTd, "max-w-[240px]")}>{renderSkills(candidate)}</td>
                        <td className={dirTd}>{renderScore(candidate)}</td>
                        <td className={dirTd}>{renderSource(candidate)}</td>
                        <td className={cn(dirTd, "whitespace-nowrap text-[13px] text-soft-ink")} suppressHydrationWarning>
                          {new Date(candidate.addedAt).toLocaleDateString(locale)}
                        </td>
                        <td className={dirTd}>{renderRowActions(candidate)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Narrow screens: one stacked row per candidate. */}
            <ul className="divide-y divide-hairline border-t border-hairline md:hidden">
              {filtered.map((candidate) => {
                const name = `${candidate.firstName} ${candidate.lastName}`;
                return (
                  <li
                    key={candidate.candidateId}
                    className={cn(
                      "flex items-start gap-3 p-4",
                      selectedIds.has(candidate.candidateId) && "bg-lime-wash",
                    )}
                  >
                    <Checkbox
                      className="mt-1"
                      aria-label={t("selectCandidate", { name })}
                      checked={selectedIds.has(candidate.candidateId)}
                      onCheckedChange={() => toggleSelect(candidate.candidateId)}
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Link
                        href={`/dashboard/candidates/${candidate.candidateId}`}
                        className="flex min-w-0 items-center gap-3"
                      >
                        <UserAvatar
                          name={name}
                          src={candidate.avatarUrl}
                          fallbackSrcs={candidate.avatarFallbackSrcs}
                          size="lg"
                        />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-near-ink">{name}</div>
                          <div className="truncate text-[13px] text-soft-ink">{candidate.email}</div>
                        </div>
                      </Link>
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        {renderScore(candidate)}
                        {renderSource(candidate)}
                      </div>
                      {candidate.skills.length > 0 ? renderSkills(candidate) : null}
                      <p className="text-xs text-soft-ink" suppressHydrationWarning>
                        {t("addedOn", { date: new Date(candidate.addedAt).toLocaleDateString(locale) })}
                      </p>
                    </div>
                    {renderRowActions(candidate)}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </DirectoryCard>

      <BulkActionBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
        {openJobs.length > 0 && (
          <BulkAction disabled={isPending} onClick={() => setBulkAssignModal(true)}>
            <Briefcase aria-hidden="true" />
            {t("assignToJob")}
          </BulkAction>
        )}
        <BulkAction danger disabled={isPending} onClick={bulkRemove}>
          <Trash2 aria-hidden="true" />
          {t("remove")}
        </BulkAction>
      </BulkActionBar>

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
          candidateName={t("bulkCandidates", { count: selectedIds.size })}
          candidateEmail=""
          jobs={openJobs}
          isBulk
          bulkCandidateIds={Array.from(selectedIds)}
        />
      )}
    </>
  );
}
