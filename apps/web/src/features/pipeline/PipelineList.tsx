"use client";

import { Suspense, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeft,
  CheckCircle2,
  RotateCcw,
  Search,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import {
  bulkMoveApplications,
  updateApplicationStatus,
} from "@/features/pipeline/actions";
import type {
  PipelineApplication,
  PipelineJobOption,
  PipelineStage,
} from "@/features/pipeline/data";
import { PipelineJobSelect } from "@/features/pipeline/PipelineJobSelect";
import { ApplicationStatusBadge } from "@/components/ui/StatusBadge";
import { PipelineSpine } from "@/components/ui/PipelineSpine";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ShortDate } from "@/lib/date";
import { cn } from "@/lib/utils";

type PipelineListProps = {
  jobs: PipelineJobOption[];
  selectedJob: PipelineJobOption;
  stages: PipelineStage[];
  applications: PipelineApplication[];
};

const ALL = "__all__";

export function PipelineList({
  jobs,
  selectedJob,
  stages,
  applications,
}: PipelineListProps) {
  const router = useRouter();
  const [activeStage, setActiveStage] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const workspaceId = applications[0]?.workspaceId ?? "";
  const stageNameById = useMemo(
    () => new Map(stages.map((s) => [s.id, s.name])),
    [stages],
  );
  const orderedStageNames = useMemo(
    () => stages.slice().sort((a, b) => a.order - b.order).map((s) => s.name),
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

  function afterBulk(result: { success: boolean; error?: string }, label: string) {
    if (result.success) {
      toast.success(`${label} ${selectedIds.length} candidate${selectedIds.length === 1 ? "" : "s"}.`);
      setSelected(new Set());
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not update candidates.");
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
      afterBulk(result, "Moved");
    });
  }

  function setStatus(status: "hired" | "rejected" | "active") {
    if (selectedIds.length === 0) return;
    startTransition(async () => {
      const result = await updateApplicationStatus({
        applicationIds: selectedIds,
        workspaceId,
        status,
      });
      afterBulk(result, "Updated");
    });
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Suspense>
          <PipelineJobSelect jobs={jobs} selectedJobId={selectedJob.id} />
        </Suspense>
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search candidates…"
            className="h-9 pl-9"
          />
        </div>
      </div>

      {/* Stage tabs */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-border/70 bg-card p-1">
        <StageTab
          label="All"
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
              label={stage.name}
              count={counts.get(stage.id) ?? 0}
              active={activeStage === stage.id}
              onClick={() => setActiveStage(stage.id)}
            />
          ))}
      </div>

      {/* Bulk bar */}
      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/25 bg-accent/40 px-3 py-2 duration-200 animate-in fade-in slide-in-from-top-1">
          <span className="text-sm font-medium">{selectedIds.length} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={isPending}>
                  <ArrowRightLeft className="size-4" />
                  Move to stage
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Move to</DropdownMenuLabel>
                {stages
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((stage) => (
                    <DropdownMenuItem key={stage.id} onClick={() => moveToStage(stage.id)}>
                      {stage.name}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => setStatus("hired")}>
              <CheckCircle2 className="size-4 text-primary" />
              Hire
            </Button>
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => setStatus("rejected")}>
              <XCircle className="size-4 text-destructive" />
              Reject
            </Button>
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => setStatus("active")}>
              <RotateCcw className="size-4" />
              Reactivate
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      {/* Rows */}
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
        <div className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5">
          <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAll} aria-label="Select all" />
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Candidate
          </span>
          <span className="ml-auto hidden text-xs font-medium uppercase tracking-wide text-muted-foreground sm:block">
            Stage
          </span>
        </div>
        <div className="divide-y divide-border/60">
          {filtered.map((a) => {
            const fullName = `${a.candidateFirstName} ${a.candidateLastName}`;
            const isSelected = selected.has(a.id);
            const stageName = stageNameById.get(a.currentStageId) ?? "—";
            return (
              <div
                key={a.id}
                role="button"
                tabIndex={0}
                data-state={isSelected ? "selected" : undefined}
                onClick={() => router.push(`/dashboard/candidates/${a.candidateId}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") router.push(`/dashboard/candidates/${a.candidateId}`);
                }}
                className="group grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3.5 transition-colors hover:bg-muted/40 data-[state=selected]:bg-accent/40 sm:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_auto]"
              >
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleOne(a.id)}
                    aria-label={`Select ${fullName}`}
                  />
                </div>
                <div className="flex min-w-0 items-center gap-3">
                  <UserAvatar name={fullName} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground group-hover:text-primary">
                      {fullName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {a.candidateEmail}
                      {a.source ? ` · via ${a.source}` : ""}
                    </p>
                  </div>
                </div>
                <div className="col-start-2 min-w-0 sm:col-auto">
                  <p className="text-xs font-medium text-foreground">{stageName}</p>
                  <PipelineSpine
                    current={stageName}
                    stages={orderedStageNames}
                    className="mt-1.5 max-w-40"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Applied <ShortDate value={a.appliedAt} />
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
              <Search className="size-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No candidates in this view.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
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
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 text-xs tabular-nums",
          active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  );
}
