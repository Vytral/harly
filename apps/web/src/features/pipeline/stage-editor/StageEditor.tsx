"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { AlertTriangle, ChevronDown, RefreshCw } from "lucide-react";
import { STAGE_KIND_LABELS, type StageKind } from "@harly/db/stage-kind";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useMotionSafe } from "@/lib/motion";
import { formatShort } from "@/lib/date";
import { cn } from "@/lib/utils";

import { AddStageForm } from "./AddStageForm";
import { ArchiveStageDialog, DeleteStageDialog } from "./StageDialogs";
import { StageRow } from "./StageRow";
import {
  activeStagesOf,
  archivedStagesOf,
  canStep,
  checkStageName,
  decideKindChange,
  isOutcomeKind,
  planMove,
} from "./model";
import { useStageEditor } from "./useStageEditor";

const OUTCOME_BOUNDARY_MESSAGE =
  "Active stages stay before outcome stages. Hired, rejected and withdrawn stay last.";

/**
 * The stage editor, shown as a sheet from the pipeline and the job page. It
 * reads the job's stages on open, applies every change through the server
 * actions, and refreshes the surrounding page after each saved change.
 */
export function StageEditor({
  open,
  onOpenChange,
  jobId,
  jobTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  jobTitle: string;
}) {
  const router = useRouter();
  const motionSafe = useMotionSafe();
  const editor = useStageEditor({ jobId, onMutated: () => router.refresh() });
  const { load, announce, reorder, rename, recolor, changeKind, setEmailEnabled, create, archive, remove } =
    editor;
  const { state, busy } = editor;

  const [archivedOpen, setArchivedOpen] = useState(false);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const stages = state.stages;
  const active = activeStagesOf(stages);
  const archived = archivedStagesOf(stages);
  const archiveStage = archiveId ? active.find((stage) => stage.id === archiveId) ?? null : null;
  const deleteStage = deleteId ? active.find((stage) => stage.id === deleteId) ?? null : null;
  const dialogOpen = archiveStage !== null || deleteStage !== null;
  const firstOutcomeIndex = active.findIndex((stage) => isOutcomeKind(stage.kind));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active: dragged, over } = event;
    if (!over || dragged.id === over.id) return;
    const toIndex = active.findIndex((stage) => stage.id === String(over.id));
    const ids = planMove(stages, String(dragged.id), toIndex);
    if (!ids) {
      announce(OUTCOME_BOUNDARY_MESSAGE);
      return;
    }
    void reorder(String(dragged.id), ids);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
        onEscapeKeyDown={(event) => {
          // Escape inside an unsaved stage name reverts the name (in the row),
          // it must not close the editor and lose the other stages' context.
          const target = event.target;
          if (target instanceof HTMLElement && target.closest("[data-name-editing='true']")) {
            event.preventDefault();
          }
        }}
      >
        <SheetHeader className="border-b px-5 py-4 text-left">
          <SheetTitle>Pipeline stages</SheetTitle>
          <SheetDescription>
            {jobTitle}. Candidates move through active stages in this order.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <p className="sr-only" role="status" aria-live="polite">
            {state.announcement}
          </p>

          {state.notice && !dialogOpen ? (
            <motion.div
              role="alert"
              variants={motionSafe.fadeUp(4)}
              initial="hidden"
              animate="visible"
              className="flex items-start gap-2 rounded-xl border bg-card px-3 py-2.5 text-sm text-foreground"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
              <p className="min-w-0 flex-1">{state.notice}</p>
              <Button type="button" variant="ghost" size="sm" onClick={editor.dismissNotice}>
                Dismiss
              </Button>
            </motion.div>
          ) : null}

          {!state.loaded && state.loadError ? (
            <EmptyState
              icon={AlertTriangle}
              title="Stages could not load"
              description={state.loadError}
              action={
                <Button type="button" variant="outline" onClick={() => void load()}>
                  <RefreshCw className="size-4" aria-hidden="true" />
                  Try again
                </Button>
              }
            />
          ) : null}

          {!state.loaded && !state.loadError ? (
            <div className="space-y-2" aria-busy="true">
              <span className="sr-only" role="status">
                Loading stages
              </span>
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ) : null}

          {state.loaded ? (
            <>
              {active.length === 0 ? (
                <EmptyState
                  compact
                  title="No active stages"
                  description="Add a stage below. New candidates enter the first active stage."
                />
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={active.map((stage) => stage.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <ul aria-label="Active stages in pipeline order" className="space-y-2">
                      {active.map((stage, index) => (
                        <Fragment key={stage.id}>
                          {firstOutcomeIndex > 0 && index === firstOutcomeIndex ? (
                            <li role="presentation" className="flex items-center gap-3 pt-2">
                              <span className="text-xs font-medium text-muted-foreground">Outcomes</span>
                              <span className="h-px flex-1 bg-hairline" aria-hidden="true" />
                            </li>
                          ) : null}
                          <StageRow
                            stage={stage}
                            position={index + 1}
                            total={active.length}
                            busy={busy}
                            canMoveUp={canStep(stages, stage.id, -1)}
                            canMoveDown={canStep(stages, stage.id, 1)}
                            checkName={(name) => checkStageName(name, active, stage.id)}
                            decideKind={(kind: StageKind) =>
                              decideKindChange({ stage, stages, nextKind: kind })
                            }
                            onMoveStep={(direction) => {
                              const ids = planMove(stages, stage.id, index + direction);
                              if (ids) void reorder(stage.id, ids);
                            }}
                            onRename={(name) => void rename(stage.id, name)}
                            onRecolor={(color) => {
                              if (color !== stage.color) void recolor(stage.id, color);
                            }}
                            onChangeKind={(kind) => {
                              if (kind !== stage.kind) void changeKind(stage.id, kind);
                            }}
                            onToggleEmail={(enabled) => void setEmailEnabled(stage.id, enabled)}
                            onArchive={() => setArchiveId(stage.id)}
                            onDelete={() => setDeleteId(stage.id)}
                          />
                        </Fragment>
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>
              )}

              <AddStageForm stages={stages} busy={busy} onCreate={create} />

              {archived.length > 0 ? (
                <section aria-label="Archived stages">
                  <button
                    type="button"
                    aria-expanded={archivedOpen}
                    aria-controls="archived-stages-list"
                    onClick={() => setArchivedOpen((value) => !value)}
                    className="flex w-full items-center justify-between rounded-lg px-1 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span>Archived stages ({archived.length})</span>
                    <ChevronDown
                      className={cn("size-4 transition-transform", archivedOpen && "rotate-180")}
                      aria-hidden="true"
                    />
                  </button>
                  {archivedOpen ? (
                    <motion.ul
                      id="archived-stages-list"
                      variants={motionSafe.fade()}
                      initial="hidden"
                      animate="visible"
                      className="mt-1 divide-y rounded-xl border"
                    >
                      {archived.map((stage) => (
                        <li key={stage.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                          <span className="font-medium text-foreground">{stage.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {STAGE_KIND_LABELS[stage.kind]} · Archived{" "}
                            {stage.archivedAt ? formatShort(stage.archivedAt) : ""}
                          </span>
                        </li>
                      ))}
                    </motion.ul>
                  ) : null}
                </section>
              ) : null}
            </>
          ) : null}
        </div>
      </SheetContent>

      <ArchiveStageDialog
        stage={archiveStage}
        stages={stages}
        busy={busy}
        notice={state.notice}
        onCancel={() => setArchiveId(null)}
        onConfirm={async (mergeIntoStageId) => {
          if (!archiveStage) return;
          const saved = await archive(archiveStage.id, mergeIntoStageId);
          if (saved) setArchiveId(null);
        }}
      />

      <DeleteStageDialog
        stage={deleteStage}
        busy={busy}
        notice={state.notice}
        onCancel={() => setDeleteId(null)}
        onConfirm={async () => {
          if (!deleteStage) return;
          const removed = await remove(deleteStage.id);
          if (removed) setDeleteId(null);
        }}
      />
    </Sheet>
  );
}
