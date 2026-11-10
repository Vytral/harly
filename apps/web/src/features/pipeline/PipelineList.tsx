"use client";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { useEffect, useId, useMemo, useState, useTransition } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { stageLabel } from "@/features/pipeline/stage-label";
import {
  ArrowRightLeft,
  CheckCircle2,
  RotateCcw,
  Search,
  XCircle,
} from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import {
  bulkMoveApplications,
  updateApplicationStatus,
} from "@/features/pipeline/actions";
import { bulkDecisionConfirmCopy } from "@/features/pipeline/confirmation";
import {
  RejectDialog,
  type RejectTarget,
} from "@/features/rejection-reasons/RejectDialog";
import { candidateHref, pipelineOrigin } from "@/features/candidates/origin";
import type {
  PipelineApplication,
  PipelineStage,
} from "@/features/pipeline/data";
import { ApplicationStatusBadge } from "@/components/ui/StatusBadge";
import { PipelineSpine } from "@/components/ui/PipelineSpine";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ShortDate } from "@/lib/date-hydration";
import { cn } from "@/lib/utils";

type PipelineListProps = {
  stages: PipelineStage[];
  applications: PipelineApplication[];
};

const ALL = "__all__";

export function PipelineList({
  stages,
  applications,
}: PipelineListProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  // Stage tab and search live in the URL (?stage=<id>&q=…), so "Back" from a
  // candidate restores them and the candidate's pager walks the same list.
  const [activeStage, setActiveStage] = useState<string>(() => {
    const fromUrl = searchParams.get("stage");
    return fromUrl && stages.some((stage) => stage.id === fromUrl) ? fromUrl : ALL;
  });
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectTargets, setRejectTargets] = useState<RejectTarget[]>([]);
  const t = useTranslations("features.pipeline.PipelineList");
  const confirmMessages = useTranslations("labels.pipeline.confirmation");
  const tStages = useTranslations("labels.pipeline.stages");
  const selectAllId = useId();
  const [isPending, startTransition] = useTransition();

  const workspaceId = applications[0]?.workspaceId ?? "";
  const jobId = applications[0]?.jobId ?? "";
  const origin = useMemo(
    () =>
      pipelineOrigin({
        jobId,
        stage: activeStage === ALL ? null : activeStage,
        q: query,
      }),
    [jobId, activeStage, query],
  );

  // Mirror the filters into the URL without a server round trip (the native
  // history API keeps the Next router and useSearchParams in sync).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (origin.stage) params.set("stage", origin.stage);
    else params.delete("stage");
    if (origin.q) params.set("q", origin.q);
    else params.delete("q");
    const next = params.toString();
    if (next === window.location.search.replace(/^\?/, "")) return;
    const handle = window.setTimeout(() => {
      window.history.replaceState(null, "", `${window.location.pathname}${next ? `?${next}` : ""}`);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [origin]);
  const stageById = useMemo(
    () => new Map(stages.map((s) => [s.id, s])),
    [stages],
  );
  const orderedSpineStages = useMemo(
    () =>
      stages
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((s) => ({ id: s.id, name: s.name, kind: s.kind })),
    [stages],
  );

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of applications) {
      map.set(a.currentStageId, (map.get(a.currentStageId) ?? 0) + 1);
    }
    return map;
  }, [applications]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return applications.filter((a) => {
      if (activeStage !== ALL && a.currentStageId !== activeStage) return false;
      if (!q) return true;
      const name = `${a.candidateFirstName} ${a.candidateLastName}`.toLowerCase();
      return (
        name.includes(q) ||
        a.candidateEmail.toLowerCase().includes(q) ||
        (a.source ?? "").toLowerCase().includes(q)
      );
    });
  }, [applications, activeStage, query]);

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((a) => selected.has(a.id));

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) filtered.forEach((a) => next.delete(a.id));
      else filtered.forEach((a) => next.add(a.id));
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedIds = useMemo(
    () => filtered.filter((a) => selected.has(a.id)).map((a) => a.id),
    [filtered, selected],
  );

  function afterBulk(result: { success: boolean; error?: string }, kind: "moved" | "updated") {
    if (result.success) {
      toast.success(
        kind === "moved"
          ? t("movedCount", { count: selectedIds.length })
          : t("updatedCount", { count: selectedIds.length }),
      );
      setSelected(new Set());
      router.refresh();
    } else {
      toast.error(result.error ?? t("updateFailed"));
    }
  }

  function moveToStage(toStageId: string) {
    if (selectedIds.length === 0) return;
    startTransition(async () => {
      const result = await bulkMoveApplications({
        applicationIds: selectedIds,
        toStageId,
        workspaceId,
      });
      afterBulk(result, "moved");
    });
  }

  async function setStatus(status: "hired" | "rejected" | "active") {
    if (selectedIds.length === 0) return;
    // Rejecting, one candidate or many, always goes through RejectDialog.
    if (status === "rejected") {
      const byId = new Map(applications.map((a) => [a.id, a]));
      setRejectTargets(
        selectedIds.flatMap((id) => {
          const application = byId.get(id);
          return application
            ? [
                {
                  applicationId: application.id,
                  candidateName: `${application.candidateFirstName} ${application.candidateLastName}`,
                  jobTitle: application.jobTitle,
                },
              ]
            : [];
        }),
      );
      setRejectOpen(true);
      return;
    }
    if (
      status === "hired" &&
      selectedIds.length > 1 &&
      !(await confirm(bulkDecisionConfirmCopy(confirmMessages, status, selectedIds.length)))
    ) {
      return;
    }
    startTransition(async () => {
      const result = await updateApplicationStatus({
        applicationIds: selectedIds,
        workspaceId,
        status,
      });
      afterBulk(result, "updated");
    });
  }

  return (
    <Card className="gap-0 py-0">
      {/* Toolbar: pill stage tabs + search */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5">
        <div
          role="tablist"
          aria-label={t("filterByStage")}
          className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto"
        >
          <StageTab
            label={t("all")}
            count={applications.length}
            active={activeStage === ALL}
            onClick={() => setActiveStage(ALL)}
          />
          {stages
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((stage) => (
              <StageTab
                key={stage.id}
                label={stageLabel(stage.name, tStages)}
                count={counts.get(stage.id) ?? 0}
                active={activeStage === stage.id}
                onClick={() => setActiveStage(stage.id)}
              />
            ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search aria-hidden className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-soft-ink" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchLabel")}
            className="h-9 rounded-full border-transparent bg-card-inset pl-9 shadow-none"
          />
        </div>
      </div>

      {/* Bulk bar */}
      {selectedIds.length > 0 ? (
        <div className="mx-4 mb-3 flex flex-wrap items-center gap-2 rounded-[var(--radius-inner)] bg-lime-wash px-3 py-2 duration-200 animate-in fade-in slide-in-from-top-1 sm:mx-5">
          <span className="text-sm font-medium text-near-ink">{t("selectedCount", { count: selectedIds.length })}</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={isPending}>
                  <ArrowRightLeft className="size-4" />
                  {t("moveToStage")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{t("moveTo")}</DropdownMenuLabel>
                {stages
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((stage) => (
                    <DropdownMenuItem key={stage.id} onClick={() => moveToStage(stage.id)}>
                      {stageLabel(stage.name, tStages)}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => setStatus("hired")}>
              <CheckCircle2 className="size-4 text-success-olive" />
              {t("hire")}
            </Button>
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => setStatus("rejected")}>
              <XCircle className="size-4 text-destructive" />
              {t("reject")}
            </Button>
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => setStatus("active")}>
              <RotateCcw className="size-4" />
              {t("reactivate")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              {t("clear")}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Rows */}
      <div className="overflow-hidden rounded-b-[var(--radius-card)]">
        <div className="flex items-center gap-3 border-y border-hairline px-4 py-2.5 sm:px-5">
          <Checkbox
            id={selectAllId}
            checked={allVisibleSelected}
            onCheckedChange={toggleAll}
            aria-label={t("selectAllVisible", { count: filtered.length })}
          />
          <label htmlFor={selectAllId} className="text-[12.5px] font-medium text-soft-ink">{t("selectAllVisible", { count: filtered.length })}</label>
          <span className="type-col-head ml-auto hidden uppercase sm:block">{t("stageHeader")}</span>
        </div>
        <div className="divide-y divide-hairline">
          {filtered.map((a) => {
            const fullName = `${a.candidateFirstName} ${a.candidateLastName}`;
            const isSelected = selected.has(a.id);
            const currentStage = stageById.get(a.currentStageId);
            const href = candidateHref(a.candidateId, origin, a.id);
            const stageName = currentStage?.name ?? t("unknownStage");
            return (
              <div
                key={a.id}
                role="button"
                tabIndex={0}
                aria-label={t("openProfile", { name: fullName })}
                data-state={isSelected ? "selected" : undefined}
                onClick={() => router.push(href as Route)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(href as Route);
                  }
                }}
                className="group grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3.5 transition-colors hover:bg-row-wash/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-near-ink data-[state=selected]:bg-lime-wash sm:px-5 sm:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_auto]"
              >
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleOne(a.id)}
                    aria-label={t("selectCandidate", { name: fullName })}
                  />
                </div>
                <Link
                  href={href as Route}
                  onClick={(event) => event.stopPropagation()}
                  className="flex min-w-0 items-center gap-3"
                >
                  <UserAvatar
                    name={fullName}
                    src={a.candidateAvatarUrl}
                    fallbackSrcs={a.candidateAvatarFallbackSrcs}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-near-ink">
                      {fullName}
                    </p>
                    <p className="truncate text-xs text-soft-ink">
                      {a.source ? t("emailVia", { email: a.candidateEmail, source: a.source }) : a.candidateEmail}
                    </p>
                  </div>
                </Link>
                <div className="col-start-2 min-w-0 sm:col-auto">
                  <p className="text-xs font-medium text-near-ink">{stageLabel(stageName, tStages)}</p>
                  <PipelineSpine
                    current={stageName}
                    currentId={a.currentStageId}
                    currentKind={currentStage?.kind ?? null}
                    stages={orderedSpineStages}
                    className="mt-1.5 max-w-40"
                  />
                  <p className="mt-1 text-xs text-soft-ink">
                    {t.rich("applied", { date: () => <ShortDate value={a.appliedAt} /> })}
                  </p>
                </div>
                <div className="col-start-2 sm:col-auto sm:self-center">
                  <ApplicationStatusBadge status={a.status} />
                </div>
              </div>
            );
          })}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <Search className="size-5 text-quiet-mist" />
              <p className="text-sm text-soft-ink">
                {t("noCandidates")}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <RejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        targets={rejectTargets}
        onRejected={() => setSelected(new Set())}
      />
    </Card>
  );
}

function StageTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink",
        active
          ? "bg-near-ink text-pure-snow"
          : "bg-soft-kraft text-soft-ink hover:bg-row-wash hover:text-near-ink",
      )}
    >
      {label}
      <span
        className={cn(
          "min-w-5 rounded-full px-1.5 text-center text-[11px] tabular-nums",
          active ? "bg-pure-snow/20 text-pure-snow" : "bg-pure-snow text-soft-ink",
        )}
      >
        {count}
      </span>
    </button>
  );
}
