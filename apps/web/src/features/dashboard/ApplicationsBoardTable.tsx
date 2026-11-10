"use client";

import { useMemo, useState, useTransition } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { ArrowRight, Filter, Mail, MoreHorizontal, Users, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { FILTER_ALL, FilterPill } from "@/components/ui/FilterPill";
import {
  AvatarStack,
  CategoryChip,
  HumanTable,
  HumanTableHead,
  PersonCell,
  RowCheckbox,
  Td,
  Th,
  Tr,
} from "@/components/ui/human-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill, type StatusPillTone } from "@/components/ui/status-pill";
import type { ApplicationsBoard } from "@/features/dashboard/applications-board";
import { stageLabel } from "@/features/pipeline/stage-label";
import { stageTone, type StageTone } from "@/lib/stage-visuals";

/**
 * Home's hero surface. One table of people who need a decision, replacing the
 * six-widget bento (DESIGN.md , "Prefer one hero table on Home").
 *
 * Filters live in the URL so a row you were looking at survives a refresh and
 * can be linked to a teammate , the previous widget grid had no addressable
 * state at all.
 */
export function ApplicationsBoardTable({
  board,
  filters,
}: {
  board: ApplicationsBoard;
  /**
   * Resolved on the server by the page. Passed down rather than re-read with
   * `useSearchParams`, which would put the same state behind a Suspense
   * boundary and give the table a second source of truth.
   */
  filters: { job?: string; stage?: string };
}) {
  const t = useTranslations("features.dashboard.applicationsBoardTable");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const tStages = useTranslations("labels.pipeline.stages");
  const jobValue = filters.job ?? FILTER_ALL;
  const stageValue = filters.stage ?? FILTER_ALL;

  const jobLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const option of board.jobOptions) map[option.value] = option.label;
    return map;
  }, [board.jobOptions]);

  const stageLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const option of board.stageOptions) map[option.value] = stageLabel(option.label, tStages);
    return map;
  }, [board.stageOptions, tStages]);

  function setFilter(key: "job" | "stage", value: string) {
    const next = new URLSearchParams();
    const merged = { ...filters, [key]: value === FILTER_ALL ? undefined : value };
    if (merged.job) next.set("job", merged.job);
    if (merged.stage) next.set("stage", merged.stage);

    setSelected(new Set());
    startTransition(() => {
      const query = next.toString();
      router.replace(`/dashboard${query ? `?${query}` : ""}` as Route, {
        scroll: false,
      });
    });
  }

  const rows = board.applications;
  const allSelected = rows.length > 0 && selected.size === rows.length;

  function toggleAll(checked: boolean) {
    setSelected(
      checked ? new Set(rows.map((row) => row.applicationId)) : new Set(),
    );
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        <FilterPill
          label={t("job")}
          value={jobValue}
          onChange={(value) => setFilter("job", value)}
          options={board.jobOptions.map((option) => option.value)}
          labelMap={jobLabels}
        />
        <FilterPill
          label={t("stage")}
          value={stageValue}
          onChange={(value) => setFilter("stage", value)}
          options={board.stageOptions.map((option) => option.value)}
          labelMap={stageLabels}
        />
      </div>

      {selected.size > 0 ? (
        <BulkBar count={selected.size} onClear={() => setSelected(new Set())} />
      ) : null}

      {rows.length === 0 ? (
        <div className="mt-5">
          {board.totalActive === 0 ? (
            <EmptyState
              icon={Users}
              title={t("emptyTitle")}
              description={t("emptyDescription")}
              action={{ href: "/dashboard/jobs/new", label: t("publishJob") }}
            />
          ) : (
            <EmptyState
              icon={Filter}
              title={t("noMatchTitle")}
              description={t("noMatchDescription")}
            />
          )}
        </div>
      ) : (
        <div className={cn("mt-3", isPending && "opacity-60 transition-opacity")}>
          <HumanTable>
            <HumanTableHead>
              <Th className="w-10 pl-2 pr-0">
                <RowCheckbox
                  checked={allSelected}
                  onChange={toggleAll}
                  label={t("selectAll")}
                />
              </Th>
              <Th>{t("columns.candidate")}</Th>
              <Th>{t("columns.role")}</Th>
              <Th>{t("columns.stage")}</Th>
              <Th>{t("columns.waiting")}</Th>
              <Th>{t("columns.team")}</Th>
              <Th className="w-14" srOnly>
                {t("columns.actions")}
              </Th>
            </HumanTableHead>
            <tbody>
              {rows.map((row) => {
                const isSelected = selected.has(row.applicationId);
                return (
                  <Tr key={row.applicationId} selected={isSelected}>
                    <Td className="w-10 pl-2 pr-0">
                      <RowCheckbox
                        checked={isSelected}
                        onChange={(checked) =>
                          toggleOne(row.applicationId, checked)
                        }
                        label={t("selectRow", { name: row.name })}
                      />
                    </Td>
                    <Td>
                      <PersonCell
                        name={row.name}
                        avatarUrl={row.avatarUrl}
                        href={
                          `/dashboard/candidates/${row.candidateId}` as Route
                        }
                      />
                    </Td>
                    <Td>
                      <span className="flex items-center gap-2">
                        <span className="text-[14px] text-near-ink">
                          {row.jobTitle}
                        </span>
                        {row.department ? (
                          <CategoryChip>{row.department}</CategoryChip>
                        ) : null}
                      </span>
                    </Td>
                    <Td>
                      <StatusPill tone={stagePillTone(row.stageKind)}>
                        {row.stageName !== null ? stageLabel(row.stageName, tStages) : t("noStage")}
                      </StatusPill>
                    </Td>
                    <Td>
                      <WaitingCell days={row.daysWaiting} />
                    </Td>
                    <Td>
                      <AvatarStack people={row.team} />
                    </Td>
                    <Td className="w-14 pl-0 pr-2 text-right">
                      <RowMenu
                        candidateId={row.candidateId}
                        name={row.name}
                      />
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </HumanTable>
        </div>
      )}
    </section>
  );
}

const stageToneToPill: Record<StageTone, StatusPillTone> = {
  neutral: "neutral",
  progress: "info",
  success: "success",
  danger: "danger",
  quiet: "neutral",
};

/** The pill tone follows what the stage means, never its name. */
function stagePillTone(kind: ApplicationsBoard["applications"][number]["stageKind"]) {
  return kind ? stageToneToPill[stageTone(kind)] : "neutral";
}

/**
 * Time-in-stage is the number that actually drives a recruiter's morning, so it
 * takes the frame's AMOUNT column. Past a week it earns clay , that is a real
 * warning, not decoration.
 */
function WaitingCell({ days }: { days: number }) {
  const t = useTranslations("features.dashboard.applicationsBoardTable");
  const label = t("waitingDays", { days });
  return (
    <span
      className={cn(
        "tabular text-[14px]",
        days >= 7 ? "text-warning-clay" : "text-soft-ink",
      )}
    >
      {label}
    </span>
  );
}

/**
 * Quiet bulk bar: advance, email, reject. Three verbs, not a floating toolbox
 * of fifteen (DESIGN.md , Human Data Table).
 */
function BulkBar({
  count,
  onClear,
}: {
  count: number;
  onClear: () => void;
}) {
  const t = useTranslations("features.dashboard.applicationsBoardTable");
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] bg-soft-kraft px-3 py-2">
      <span className="font-chrome text-[12px] text-soft-ink">
        {t("selectedCount", { count })}
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-full bg-near-ink px-3.5 py-1.5 text-[13px] font-medium text-pure-snow transition-colors hover:bg-[var(--pine-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink focus-visible:ring-offset-2"
        >
          <ArrowRight className="size-3.5" strokeWidth={2} />
          {t("advance")}
        </button>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-full border border-mist-border bg-pure-snow px-3.5 py-1.5 text-[13px] font-medium text-near-ink transition-colors hover:bg-row-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
        >
          <Mail className="size-3.5" strokeWidth={2} />
          {t("email")}
        </button>
        <button
          type="button"
          onClick={onClear}
          aria-label={t("clearSelection")}
          className="flex size-8 items-center justify-center rounded-full text-soft-ink transition-colors hover:bg-row-wash hover:text-near-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
        >
          <X className="size-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

/** Per-row overflow, so the surface never grows a global 12-button toolbar. */
function RowMenu({
  candidateId,
  name,
}: {
  candidateId: string;
  name: string;
}) {
  const t = useTranslations("features.dashboard.applicationsBoardTable");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("rowActions", { name })}
        className="ml-auto flex size-8 items-center justify-center rounded-full text-soft-ink max-md:opacity-100 opacity-0 transition-opacity hover:bg-pure-snow hover:text-near-ink focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink group-hover/row:opacity-100 data-[state=open]:opacity-100"
      >
        <MoreHorizontal className="size-4" strokeWidth={2} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem asChild>
          <a href={`/dashboard/candidates/${candidateId}`}>{t("openCandidate")}</a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={`/dashboard/candidates/${candidateId}#process`}>
            {t("moveStage")}
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
