"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateStageEmailSettings } from "@/features/pipeline/actions";
import {
  boardWriteQueueFor,
  showSettledToast,
} from "@/features/pipeline/board-write-queue";
import {
  buildColumns,
  CARD_PAGE_SIZE,
  deriveColumns,
  displayName,
  failureMessage,
  FALLBACK_FAILURE_MESSAGE,
  findApplicationStage,
  getOverTarget,
  limitToReveal,
  matchesSearch,
  nextPageSize,
  pendingApplicationIds,
  planDropOperation,
  visibleApplications,
  type BoardOperation,
  type Settlement,
} from "@/features/pipeline/board-state";
import { bulkDecisionConfirmationMessage } from "@/features/pipeline/confirmation";
import {
  CandidateCard,
  CandidateCardOverlay,
} from "@/features/pipeline/CandidateCard";
import type {
  PipelineApplication,
  PipelineJobOption,
  PipelineStage,
} from "@/features/pipeline/data";
import { StageColumn } from "@/features/pipeline/StageColumn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  CaretDownIcon,
  CheckIcon,
  SearchIcon,
  XIcon,
} from "@/components/ui/icons/phosphor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { outcomeForStage } from "@/lib/stage-visuals";

type PipelineBoardProps = {
  jobs: PipelineJobOption[];
  selectedJob: PipelineJobOption;
  stages: PipelineStage[];
  applications: PipelineApplication[];
};

type StatusFilter = "all" | PipelineApplication["status"];

/**
 * A successful write refreshes the server data, which remounts the board (the
 * page keys it on the data). Focus on a keyboard-moved card would be lost in that
 * remount, so the id is handed to the next instance here.
 */
let pendingFocusHandoff: string | null = null;

function newOperationId() {
  return globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function focusHandle(applicationId: string) {
  const handles = document.querySelectorAll<HTMLElement>(
    `[data-pipeline-handle="${applicationId}"]`,
  );
  for (const handle of handles) {
    // The desktop and mobile trees are both mounted; focus the visible one.
    if (handle.offsetParent !== null) {
      handle.focus();
      return;
    }
  }
}

function ShowMoreButton({
  count,
  stageName,
  onClick,
}: {
  count: number;
  stageName: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Show ${count} more candidates in ${stageName}`}
      className="font-chrome rounded-[var(--radius-md)] px-2 py-2 text-center text-[12px] text-soft-ink transition-colors hover:bg-row-wash hover:text-near-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
    >
      Show {count} more
    </button>
  );
}

export function PipelineBoard({
  selectedJob,
  stages: initialStages,
  applications,
}: PipelineBoardProps) {
  const router = useRouter();
  const [stages, setStages] = useState(initialStages);
  const baseColumns = useMemo(
    () => buildColumns(stages, applications),
    [stages, applications],
  );

  // Writes in flight or waiting, shared per job and kept across remounts. The
  // board shows the server data plus these, in order.
  const queue = useMemo(() => boardWriteQueueFor(selectedJob.id), [selectedJob.id]);
  const entries = useSyncExternalStore(
    queue.subscribe,
    queue.getEntries,
    queue.getEntries,
  );
  const columns = useMemo(
    () => deriveColumns(baseColumns, entries),
    [baseColumns, entries],
  );
  const pendingIds = useMemo(() => pendingApplicationIds(entries), [entries]);

  const [activeApplication, setActiveApplication] =
    useState<PipelineApplication | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // Set when focus should move to a card once the board shows it (after a
  // rollback or a keyboard move, the card may have changed column).
  const focusRequestRef = useRef<string | null>(null);
  const [limits, setLimits] = useState<Record<string, number>>({});
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [hideEmptyColumns, setHideEmptyColumns] = useState(false);
  const [mobileStage, setMobileStage] = useState<string>(
    initialStages[0]?.id ?? "",
  );
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor),
  );

  const selectedApplications = useMemo(() => {
    const applicationsById = new Map(
      Array.from(columns.values())
        .flat()
        .map((application) => [application.id, application]),
    );

    return Array.from(selectedIds)
      .map((id) => applicationsById.get(id))
      .filter((application): application is PipelineApplication =>
        Boolean(application),
      );
  }, [columns, selectedIds]);

  const filteredColumns = useMemo(
    () =>
      new Map(
        Array.from(columns.entries()).map(([stageId, stageApplications]) => [
          stageId,
          stageApplications.filter(
            (application) =>
              (statusFilter === "all" || application.status === statusFilter) &&
              matchesSearch(application, searchQuery),
          ),
        ]),
      ),
    [columns, searchQuery, statusFilter],
  );
  const visibleStages = hideEmptyColumns
    ? stages.filter((stage) => (filteredColumns.get(stage.id)?.length ?? 0) > 0)
    : stages;
  const mobileAll = filteredColumns.get(mobileStage) ?? [];
  const mobileLimit = limits[mobileStage] ?? CARD_PAGE_SIZE;

  function candidateLabel(applicationId: string) {
    const found = findApplicationStage(columns, applicationId);
    return found ? displayName(found.application) : "Candidate";
  }

  function stageLabel(stageId: string) {
    return stages.find((stage) => stage.id === stageId)?.name ?? "stage";
  }

  const dragAnnouncements: Announcements = {
    onDragStart({ active }) {
      return `Picked up ${candidateLabel(String(active.id))}.`;
    },
    onDragOver({ active, over }) {
      if (!over) return undefined;
      const target = getOverTarget(columns, stages, String(over.id));
      if (!target) return undefined;
      return `${candidateLabel(String(active.id))} is over ${stageLabel(target.stageId)}.`;
    },
    onDragEnd({ active, over }) {
      if (!over) return `${candidateLabel(String(active.id))} was not moved.`;
      const target = getOverTarget(columns, stages, String(over.id));
      if (!target) return `${candidateLabel(String(active.id))} was not moved.`;
      return `${candidateLabel(String(active.id))} moved to ${stageLabel(target.stageId)}.`;
    },
    onDragCancel({ active }) {
      return `Moving ${candidateLabel(String(active.id))} was cancelled.`;
    },
  };

  function revealUpTo(stageId: string, index: number) {
    setLimits((current) => {
      const have = current[stageId] ?? CARD_PAGE_SIZE;
      const need = limitToReveal(index);
      return need > have ? { ...current, [stageId]: need } : current;
    });
  }

  function showMore(stageId: string) {
    setLimits((current) => ({
      ...current,
      [stageId]: (current[stageId] ?? CARD_PAGE_SIZE) + CARD_PAGE_SIZE,
    }));
  }

  function enqueueOperation(operation: BoardOperation) {
    setError(null);
    queue.enqueue(operation);
  }

  /** Shows the outcome of a write this board started (or inherited). */
  function handleSettled(settlement: Settlement) {
    setAnnouncement(settlement.announcement);
    setError(settlement.error);
    for (const item of settlement.toasts) showSettledToast(item);
    if (settlement.deselect.length > 0) {
      const done = new Set(settlement.deselect);
      setSelectedIds((current) => {
        const next = new Set(current);
        for (const id of done) next.delete(id);
        return next;
      });
    }
    if (settlement.focusApplicationId) {
      focusRequestRef.current = settlement.focusApplicationId;
    }
    if (settlement.handoffFocusApplicationId) {
      const applicationId = settlement.handoffFocusApplicationId;
      pendingFocusHandoff = applicationId;
      // Only a remount consumes the handoff. If none happens, do not let a
      // later, unrelated mount steal focus.
      window.setTimeout(() => {
        if (pendingFocusHandoff === applicationId) pendingFocusHandoff = null;
      }, 3000);
    }
    if (settlement.refresh) {
      router.refresh();
    }
  }

  // Report outcomes to whichever board is mounted now. Re-attached every render
  // so the handler always sees current state; a remount attaches its own.
  useEffect(() => {
    return queue.attach({
      onSettled: (_operation, settlement) => handleSettled(settlement),
    });
  });

  // Saved writes are now part of the server data, so the overlay can drop them.
  useEffect(() => {
    queue.pruneSaved();
  }, [applications, queue]);

  useEffect(() => {
    const applicationId = focusRequestRef.current;
    if (!applicationId) return;
    focusRequestRef.current = null;
    focusHandle(applicationId);
  }, [columns, entries]);

  useEffect(() => {
    const applicationId = pendingFocusHandoff;
    if (!applicationId) return;
    pendingFocusHandoff = null;
    focusHandle(applicationId);
  }, []);

  function handleSelect(applicationId: string, selected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (selected) {
        next.add(applicationId);
      } else {
        next.delete(applicationId);
      }

      return next;
    });
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveApplication(findApplicationStage(columns, String(event.active.id))?.application ?? null);
    setError(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveApplication(null);

    if (!event.over) return;

    const operation = planDropOperation({
      id: newOperationId(),
      columns,
      stages,
      applicationId: String(event.active.id),
      overId: String(event.over.id),
      issuedAt: new Date().toISOString(),
      keyboard: event.activatorEvent instanceof KeyboardEvent,
    });

    if (!operation) return;

    // Dropping into a capped column appends the card, so the column opens far
    // enough to show it.
    revealUpTo(operation.toStageId, operation.index);
    enqueueOperation(operation);
  }

  function handleStatusChange(
    applicationIds: string[],
    status: PipelineApplication["status"],
  ) {
    const targets = Array.from(columns.values())
      .flat()
      .filter((application) => applicationIds.includes(application.id));

    if (targets.length === 0) {
      return;
    }

    if (
      targets.length > 1 &&
      (status === "hired" || status === "rejected") &&
      !window.confirm(bulkDecisionConfirmationMessage(status, targets.length))
    ) {
      return;
    }

    enqueueOperation({
      kind: "status",
      id: newOperationId(),
      workspaceId: targets[0].workspaceId,
      subject:
        targets.length === 1 ? displayName(targets[0]) : `${targets.length} candidates`,
      issuedAt: new Date().toISOString(),
      applicationIds: targets.map((application) => application.id),
      status,
    });
  }

  function handleBulkMove(toStageId: string) {
    const toStage = stages.find((stage) => stage.id === toStageId);
    if (!toStage || selectedApplications.length === 0) {
      return;
    }

    const applicationIds = selectedApplications.map((application) => application.id);

    enqueueOperation({
      kind: "bulkMove",
      id: newOperationId(),
      workspaceId: selectedApplications[0].workspaceId,
      subject: `${applicationIds.length} candidates`,
      issuedAt: new Date().toISOString(),
      applicationIds,
      toStageId,
      toStageName: toStage.name,
      outcome: outcomeForStage(toStage),
    });
    revealUpTo(
      toStageId,
      (columns.get(toStageId)?.length ?? 0) + applicationIds.length - 1,
    );
  }

  async function handleToggleStageEmail(stageId: string, enabled: boolean) {
    const stage = stages.find((item) => item.id === stageId);

    if (!stage) {
      return;
    }

    const previous = stage.emailConfig;
    const restore = () =>
      setStages((current) =>
        current.map((item) =>
          item.id === stageId ? { ...item, emailConfig: previous } : item,
        ),
      );

    setStages((current) =>
      current.map((item) =>
        item.id === stageId
          ? {
              ...item,
              emailConfig: { candidateUpdatesEnabled: enabled },
            }
          : item,
      ),
    );

    try {
      const result = await updateStageEmailSettings({
        workspaceId: applications[0]?.workspaceId ?? "",
        jobId: selectedJob.id,
        stageId,
        candidateUpdatesEnabled: enabled,
      });

      if (!result.success) {
        restore();
        toast.error(failureMessage(result.error));
      }
    } catch (caught) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[pipeline-board] stage email update failed", caught);
      }
      restore();
      toast.error(FALLBACK_FAILURE_MESSAGE);
    }
  }

  const filterBar = (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Search candidates"
          value={searchQuery}
          onChange={(event) => {
            setSearchQuery(event.target.value);
            setSelectedIds(new Set());
          }}
          placeholder="Search candidates…"
          className="w-full pl-9 sm:w-48"
        />
      </div>
      <Select
        value={statusFilter}
        onValueChange={(value) => {
          setStatusFilter(value as StatusFilter);
          setSelectedIds(new Set());
        }}
      >
        <SelectTrigger className="w-full sm:w-36" aria-label="Filter by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="hired">Hired</SelectItem>
          <SelectItem value="rejected">Rejected</SelectItem>
          <SelectItem value="withdrawn">Withdrawn</SelectItem>
        </SelectContent>
      </Select>
      <label className="hidden items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-sm font-medium text-muted-foreground sm:flex">
        <Checkbox
          checked={hideEmptyColumns}
          onCheckedChange={(checked) => setHideEmptyColumns(checked === true)}
        />
        Hide empty
      </label>
    </div>
  );

  const bulkBar = selectedApplications.length > 0 ? (
    <div className="flex flex-col gap-3 rounded-xl border bg-accent/40 p-3 sm:flex-row sm:items-center sm:justify-between">
      <Badge variant="secondary" className="w-fit">
        {selectedApplications.length} selected
      </Badge>
      <div className="flex flex-wrap gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Move to stage
              <CaretDownIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {stages.map((stage) => (
              <DropdownMenuItem
                key={stage.id}
                onClick={() => handleBulkMove(stage.id)}
              >
                {stage.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          size="sm"
          onClick={() =>
            handleStatusChange(
              selectedApplications.map((application) => application.id),
              "hired",
            )
          }
        >
          <CheckIcon className="size-4" />
          Hire
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() =>
            handleStatusChange(
              selectedApplications.map((application) => application.id),
              "rejected",
            )
          }
        >
          <XIcon className="size-4" />
          Reject
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setSelectedIds(new Set())}
        >
          Clear
        </Button>
      </div>
    </div>
  ) : null;

  return (
    <div className="space-y-3">
      {filterBar}
      {bulkBar}

      {/* Polite live region for moves and saves; errors use the alert below. */}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {error ? (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm font-medium text-destructive"
        >
          {error}
        </div>
      ) : null}

      {/* Mobile: stage selector + vertical card list */}
      <div className="sm:hidden">
        <Select value={mobileStage} onValueChange={setMobileStage}>
          <SelectTrigger className="w-full" aria-label="Select stage">
            <SelectValue placeholder="Select stage" />
          </SelectTrigger>
          <SelectContent>
            {stages.map((stage) => (
              <SelectItem key={stage.id} value={stage.id}>
                <span className="flex items-center gap-2">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: stage.color ?? "#a1a1aa" }}
                  />
                  {stage.name}
                  <span className="text-muted-foreground">
                    ({filteredColumns.get(stage.id)?.length ?? 0})
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="mt-3 space-y-2">
          {visibleApplications(mobileAll, mobileLimit).map((application) => (
            <CandidateCard
              key={application.id}
              application={application}
              selected={selectedIds.has(application.id)}
              pending={pendingIds.has(application.id)}
              onSelect={handleSelect}
            />
          ))}
          {mobileAll.length > mobileLimit ? (
            <ShowMoreButton
              count={nextPageSize(mobileAll.length, mobileLimit)}
              stageName={stageLabel(mobileStage)}
              onClick={() => showMore(mobileStage)}
            />
          ) : null}
          {mobileAll.length === 0 ? (
            <div className="flex items-center justify-center rounded-[var(--radius-md)] bg-warm-paper p-8 text-center text-[13px] text-soft-ink">
              No candidates in this stage
            </div>
          ) : null}
        </div>
      </div>

      {/* Desktop: full board with DnD */}
      <div className="hidden sm:block">
        <DndContext
          id={`pipeline-${selectedJob.id}`}
          sensors={sensors}
          collisionDetection={pointerWithin}
          accessibility={{ announcements: dragAnnouncements }}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveApplication(null)}
        >
          {/* 17rem, not 15: a name plus the fit note plus the stage age has to
              fit on one line, or every card truncates its own meta. */}
          <div className="group/board grid grid-flow-col auto-cols-[minmax(17rem,1fr)] gap-2 overflow-x-auto overscroll-x-contain pb-2">
            {visibleStages.map((stage, index) => {
              const stageApplications = filteredColumns.get(stage.id) ?? [];
              const limit = limits[stage.id] ?? CARD_PAGE_SIZE;
              return (
                <StageColumn
                  key={stage.id}
                  stage={stage}
                  applications={visibleApplications(stageApplications, limit)}
                  totalCount={stageApplications.length}
                  remainingCount={Math.max(0, stageApplications.length - limit)}
                  revealCount={nextPageSize(stageApplications.length, limit)}
                  selectedIds={selectedIds}
                  pendingIds={pendingIds}
                  index={index}
                  total={visibleStages.length}
                  onSelect={handleSelect}
                  onShowMore={showMore}
                  onToggleStageEmail={(stageId, enabled) => {
                    void handleToggleStageEmail(stageId, enabled);
                  }}
                />
              );
            })}
          </div>
          <DragOverlay>
            {activeApplication ? (
              <CandidateCardOverlay application={activeApplication} />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
