"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

import {
  bulkMoveApplications,
  moveApplicationInPipeline,
  updateApplicationStatus,
  updateStageEmailSettings,
} from "@/features/pipeline/actions";
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

type PipelineBoardProps = {
  jobs: PipelineJobOption[];
  selectedJob: PipelineJobOption;
  stages: PipelineStage[];
  applications: PipelineApplication[];
};

type StatusFilter = "all" | PipelineApplication["status"];

function buildColumns(
  stages: PipelineStage[],
  applications: PipelineApplication[],
) {
  const nextColumns = new Map<string, PipelineApplication[]>();

  for (const stage of stages) {
    nextColumns.set(stage.id, []);
  }

  for (const application of applications) {
    const stageApplications = nextColumns.get(application.currentStageId);

    if (stageApplications) {
      stageApplications.push(application);
    }
  }

  return nextColumns;
}

function cloneColumns(columns: Map<string, PipelineApplication[]>) {
  return new Map(
    Array.from(columns.entries()).map(([stageId, applications]) => [
      stageId,
      [...applications],
    ]),
  );
}

function findApplicationStage(
  columns: Map<string, PipelineApplication[]>,
  applicationId: string,
) {
  for (const [stageId, applications] of columns) {
    const index = applications.findIndex((item) => item.id === applicationId);

    if (index >= 0) {
      return { stageId, application: applications[index], index };
    }
  }

  return null;
}

function removeApplication(
  columns: Map<string, PipelineApplication[]>,
  stageId: string,
  applicationId: string,
) {
  const applications = columns.get(stageId) ?? [];
  columns.set(
    stageId,
    applications.filter((application) => application.id !== applicationId),
  );
}

function insertApplication(
  columns: Map<string, PipelineApplication[]>,
  stageId: string,
  application: PipelineApplication,
  index: number,
) {
  const applications = [...(columns.get(stageId) ?? [])];
  const boundedIndex = Math.max(0, Math.min(index, applications.length));
  applications.splice(boundedIndex, 0, application);
  columns.set(stageId, applications);
}

function getOverTarget(
  columns: Map<string, PipelineApplication[]>,
  stages: PipelineStage[],
  overId: string,
) {
  const stage = stages.find((item) => item.id === overId);

  if (stage) {
    return {
      stageId: stage.id,
      index: columns.get(stage.id)?.length ?? 0,
    };
  }

  const application = findApplicationStage(columns, overId);

  if (application) {
    return {
      stageId: application.stageId,
      index: application.index,
    };
  }

  return null;
}

function matchesSearch(application: PipelineApplication, query: string) {
  if (!query.trim()) {
    return true;
  }

  const haystack = [
    application.candidateFirstName,
    application.candidateLastName,
    application.candidateEmail,
    application.jobTitle,
    application.source ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.trim().toLowerCase());
}

export function PipelineBoard({
  selectedJob,
  stages: initialStages,
  applications,
}: PipelineBoardProps) {
  const [stages, setStages] = useState(initialStages);
  const [columns, setColumns] = useState<Map<string, PipelineApplication[]>>(
    () => buildColumns(initialStages, applications),
  );
  const [activeApplication, setActiveApplication] =
    useState<PipelineApplication | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
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
  const mobileApplications = filteredColumns.get(mobileStage) ?? [];

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
    const applicationId = String(event.active.id);
    const current = findApplicationStage(columns, applicationId);

    setActiveApplication(current?.application ?? null);
    setError(null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const applicationId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;

    setActiveApplication(null);

    if (!overId) {
      return;
    }

    const current = findApplicationStage(columns, applicationId);
    const target = getOverTarget(columns, stages, overId);

    if (!current || !target) {
      return;
    }

    const previousColumns = cloneColumns(columns);
    const optimisticColumns = cloneColumns(columns);
    const movedApplication = {
      ...current.application,
      currentStageId: target.stageId,
      lastStageMovedAt:
        current.stageId === target.stageId
          ? current.application.lastStageMovedAt
          : new Date().toISOString(),
    };

    removeApplication(optimisticColumns, current.stageId, applicationId);
    insertApplication(
      optimisticColumns,
      target.stageId,
      movedApplication,
      current.stageId === target.stageId && target.index > current.index
        ? target.index - 1
        : target.index,
    );

    const orderedApplicationIds =
      optimisticColumns.get(target.stageId)?.map((application) => application.id) ??
      [];

    setColumns(optimisticColumns);
    setError(null);

    const result = await moveApplicationInPipeline({
      applicationId,
      fromStageId: current.stageId,
      toStageId: target.stageId,
      workspaceId: current.application.workspaceId,
      orderedApplicationIds,
    });

    if (!result.success) {
      setColumns(previousColumns);
      setError(result.error ?? "Unable to update pipeline.");
    }
  }

  async function handleStatusChange(
    applicationIds: string[],
    status: PipelineApplication["status"],
  ) {
    const allApplications = Array.from(columns.values()).flat();
    const firstApplication = allApplications.find((application) =>
      applicationIds.includes(application.id),
    );

    if (!firstApplication) {
      return;
    }

    const previousColumns = cloneColumns(columns);
    const optimisticColumns = cloneColumns(columns);

    for (const [stageId, stageApplications] of optimisticColumns) {
      optimisticColumns.set(
        stageId,
        stageApplications.map((application) =>
          applicationIds.includes(application.id)
            ? { ...application, status }
            : application,
        ),
      );
    }

    setColumns(optimisticColumns);
    setError(null);

    const result = await updateApplicationStatus({
      applicationIds,
      workspaceId: firstApplication.workspaceId,
      status,
    });

    if (!result.success) {
      setColumns(previousColumns);
      setError(result.error ?? "Unable to update application status.");
      return;
    }

    setSelectedIds((current) => {
      const next = new Set(current);
      for (const applicationId of applicationIds) {
        next.delete(applicationId);
      }
      return next;
    });
  }

  async function handleBulkMove(toStageId: string) {
    if (selectedApplications.length === 0) {
      return;
    }

    const previousColumns = cloneColumns(columns);
    const optimisticColumns = cloneColumns(columns);
    const workspaceId = selectedApplications[0].workspaceId;
    const movedIds = selectedApplications.map((application) => application.id);

    for (const application of selectedApplications) {
      removeApplication(
        optimisticColumns,
        application.currentStageId,
        application.id,
      );
      insertApplication(
        optimisticColumns,
        toStageId,
        {
          ...application,
          currentStageId: toStageId,
          lastStageMovedAt: new Date().toISOString(),
        },
        optimisticColumns.get(toStageId)?.length ?? 0,
      );
    }

    setColumns(optimisticColumns);
    setError(null);

    const result = await bulkMoveApplications({
      applicationIds: movedIds,
      toStageId,
      workspaceId,
    });

    if (!result.success) {
      setColumns(previousColumns);
      setError(result.error ?? "Unable to move selected candidates.");
      return;
    }

    setSelectedIds(new Set());
  }

  async function handleToggleStageEmail(stageId: string, enabled: boolean) {
    const previousStages = stages;
    const stage = stages.find((item) => item.id === stageId);

    if (!stage) {
      return;
    }

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

    const result = await updateStageEmailSettings({
      workspaceId: applications[0]?.workspaceId ?? "",
      stageId,
      candidateUpdatesEnabled: enabled,
    });

    if (!result.success) {
      setStages(previousStages);
      setError(result.error ?? "Unable to update stage email settings.");
    }
  }

  const filterBar = (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search candidates…"
          className="w-full pl-9 sm:w-48"
        />
      </div>
      <Select
        value={statusFilter}
        onValueChange={(value) => setStatusFilter(value as StatusFilter)}
      >
        <SelectTrigger className="w-full sm:w-36">
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
                onClick={() => void handleBulkMove(stage.id)}
              >
                {stage.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          size="sm"
          onClick={() =>
            void handleStatusChange(
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
            void handleStatusChange(
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

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm font-medium text-destructive">
          {error}
        </div>
      ) : null}

      {/* Mobile: stage selector + vertical card list */}
      <div className="sm:hidden">
        <Select value={mobileStage} onValueChange={setMobileStage}>
          <SelectTrigger className="w-full">
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
          {mobileApplications.map((application) => (
            <CandidateCard
              key={application.id}
              application={application}
              selected={selectedIds.has(application.id)}
              onSelect={handleSelect}
              onStatusChange={handleStatusChange}
            />
          ))}
          {mobileApplications.length === 0 ? (
            <div className="flex items-center justify-center rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
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
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveApplication(null)}
        >
          <div className="grid grid-flow-col auto-cols-[minmax(15rem,1fr)] gap-3 overflow-x-auto overscroll-x-contain pb-2">
            {visibleStages.map((stage) => (
              <StageColumn
                key={stage.id}
                stage={stage}
                applications={filteredColumns.get(stage.id) ?? []}
                selectedIds={selectedIds}
                onSelect={handleSelect}
                onStatusChange={handleStatusChange}
                onToggleStageEmail={(stageId, enabled) => {
                  void handleToggleStageEmail(stageId, enabled);
                }}
              />
            ))}
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
