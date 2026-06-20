"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import type { TaskItem, TaskStatus } from "./shared";
import { TASK_STATUS_LABELS } from "./shared";
import { TaskCard, TaskCardOverlay } from "./TaskCard";
import { STATUS_ACCENT, STATUS_COLOR, STATUS_ICON, type TaskHandlers } from "./task-ui";

const COLUMNS: TaskStatus[] = ["pending", "in_progress", "completed", "canceled"];

function Column({
  status,
  tasks,
  handlers,
}: {
  status: TaskStatus;
  tasks: TaskItem[];
  handlers: TaskHandlers;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: status, data: { status } });
  const Icon = STATUS_ICON[status];

  return (
    <section className="flex min-w-0 flex-col gap-2.5">
      <div
        className="flex items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-2"
        style={{ borderTopColor: STATUS_ACCENT[status], borderTopWidth: 2 }}
      >
        <Icon className={cn("size-4 shrink-0", STATUS_COLOR[status])} strokeWidth={2} />
        <h2 className="truncate text-sm font-semibold">{TASK_STATUS_LABELS[status]}</h2>
        <span className="rounded-full bg-muted px-1.5 text-xs font-medium tabular-nums text-muted-foreground">
          {tasks.length}
        </span>
        <button
          type="button"
          onClick={() => handlers.add(status)}
          aria-label={`Add task to ${TASK_STATUS_LABELS[status]}`}
          className="ml-auto rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <Plus className="size-4" />
        </button>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[22rem] flex-1 flex-col gap-2.5 rounded-2xl border border-dashed p-2.5 transition-colors",
          isOver ? "border-primary/50 bg-accent/40" : "border-border/60 bg-muted/25",
        )}
      >
        {tasks.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 py-12 text-center">
            <Icon className="size-5 text-muted-foreground/40" strokeWidth={1.5} />
            <p className="text-xs text-muted-foreground">
              {isOver ? "Drop here" : "Drag a card here"}
            </p>
          </div>
        ) : (
          tasks.map((task) => <TaskCard key={task.id} task={task} handlers={handlers} />)
        )}
      </div>
    </section>
  );
}

export function TaskBoard({
  tasks,
  handlers,
}: {
  tasks: TaskItem[];
  handlers: TaskHandlers;
}) {
  const [active, setActive] = useState<TaskItem | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  function handleDragStart(event: DragStartEvent) {
    setActive(tasks.find((t) => t.id === String(event.active.id)) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActive(null);
    const { active: a, over } = event;
    if (!over) return;

    const task = tasks.find((t) => t.id === String(a.id));
    if (!task) return;

    // `over` is either a column (status id) or another card (carries data.status).
    const overId = String(over.id);
    const target = (COLUMNS.includes(overId as TaskStatus)
      ? overId
      : (over.data.current?.status as TaskStatus | undefined)) as TaskStatus | undefined;

    if (target && target !== task.status) {
      handlers.setStatus(task.id, target);
    }
  }

  return (
    <DndContext
      id="tasks-board"
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActive(null)}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((status) => (
          <Column
            key={status}
            status={status}
            tasks={tasks.filter((t) => t.status === status)}
            handlers={handlers}
          />
        ))}
      </div>
      <DragOverlay>{active ? <TaskCardOverlay task={active} /> : null}</DragOverlay>
    </DndContext>
  );
}
