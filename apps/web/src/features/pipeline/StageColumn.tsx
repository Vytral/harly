"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Bell, BellOff } from "lucide-react";

import { CandidateCard } from "@/features/pipeline/CandidateCard";
import type {
  PipelineApplication,
  PipelineStage,
} from "@/features/pipeline/data";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StageColumnProps = {
  stage: PipelineStage;
  applications: PipelineApplication[];
  selectedIds: Set<string>;
  onSelect: (applicationId: string, selected: boolean) => void;
  onStatusChange: (
    applicationIds: string[],
    status: PipelineApplication["status"],
  ) => void;
  onToggleStageEmail: (stageId: string, enabled: boolean) => void;
};

export function StageColumn({
  stage,
  applications,
  selectedIds,
  onSelect,
  onStatusChange,
  onToggleStageEmail,
}: StageColumnProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: stage.id,
    data: { type: "stage", stageId: stage.id },
  });
  const emailOn = stage.emailConfig.candidateUpdatesEnabled;

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex min-h-[34rem] w-72 shrink-0 flex-col rounded-xl border bg-muted/40 transition",
        isOver && "border-primary/40 bg-accent/60",
      )}
    >
      <div className="sticky top-0 z-10 rounded-t-xl border-b bg-muted/60 p-3 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: stage.color ?? "#a1a1aa" }}
              aria-hidden
            />
            <h2 className="truncate text-sm font-semibold">{stage.name}</h2>
            <Badge variant="secondary" className="tabular-nums">
              {applications.length}
            </Badge>
          </div>
          <button
            type="button"
            onClick={() => onToggleStageEmail(stage.id, !emailOn)}
            title={
              emailOn
                ? "Candidate email updates on"
                : "Candidate email updates off"
            }
            className={cn(
              "flex size-7 items-center justify-center rounded-md transition",
              emailOn
                ? "bg-emerald-50 text-emerald-700"
                : "text-muted-foreground hover:bg-accent",
            )}
            aria-label="Toggle candidate email updates"
          >
            {emailOn ? (
              <Bell className="size-4" />
            ) : (
              <BellOff className="size-4" />
            )}
          </button>
        </div>
      </div>

      <SortableContext
        items={applications.map((application) => application.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-1 flex-col gap-2 p-2">
          {applications.map((application) => (
            <CandidateCard
              key={application.id}
              application={application}
              selected={selectedIds.has(application.id)}
              onSelect={onSelect}
              onStatusChange={onStatusChange}
            />
          ))}
          {applications.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed p-4 text-center text-xs font-medium text-muted-foreground">
              Drop candidates here
            </div>
          ) : null}
        </div>
      </SortableContext>
    </section>
  );
}
