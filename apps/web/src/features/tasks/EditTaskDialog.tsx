"use client";

import { useState, useTransition } from "react";
import { Calendar, Flag, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { InterviewerSelect, type InterviewerOption } from "@/features/candidates/InterviewerSelect";
import { updateTask } from "./actions";
import { TaskLinkFields, type TaskContextOptions, type TaskLinkValues } from "./TaskLinkFields";
import type { TaskItem, TaskPriority } from "./shared";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS } from "./shared";

type Member = { id: string; name: string; image: string | null };

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  low: "border-zinc-300 text-zinc-500",
  medium: "border-blue-300 text-blue-600",
  high: "border-orange-300 text-orange-600",
  urgent: "border-red-300 text-red-600",
};

function toInterviewerOption(m: Member): InterviewerOption {
  return { userId: m.id, name: m.name, image: m.image };
}

export function EditTaskDialog({
  open,
  onOpenChange,
  task,
  members,
  contextOptions,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: TaskItem | null;
  members: Member[];
  contextOptions: TaskContextOptions;
  onSave: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "medium");
  const [dueDate, setDueDate] = useState(task?.dueDate?.slice(0, 10) ?? "");
  const [ownerId, setOwnerId] = useState(task?.ownerId ?? members[0]?.id ?? "");
  const [links, setLinks] = useState<TaskLinkValues>({
    candidateId: task?.candidateId ?? null,
    applicationId: task?.applicationId ?? null,
    jobId: task?.jobId ?? null,
    interviewId: task?.interviewId ?? null,
  });
  const [error, setError] = useState<string | null>(null);

  function syncFrom(t: TaskItem) {
    setTitle(t.title);
    setDescription(t.description ?? "");
    setPriority(t.priority);
    setDueDate(t.dueDate?.slice(0, 10) ?? "");
    setOwnerId(t.ownerId);
    setLinks({
      candidateId: t.candidateId,
      applicationId: t.applicationId,
      jobId: t.jobId,
      interviewId: t.interviewId,
    });
    setError(null);
  }

  function handleOpenChange(v: boolean) {
    if (!v) setError(null);
    onOpenChange(v);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!task) return;
    setError(null);

    startTransition(async () => {
      const result = await updateTask({
        taskId: task.id,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        dueDate: dueDate || null,
        ownerId: ownerId || undefined,
        candidateId: links.candidateId,
        applicationId: links.applicationId,
        jobId: links.jobId,
        interviewId: links.interviewId,
      });

      if (result.success) {
        toast.success("Task updated");
        onSave();
      } else {
        setError(result.error ?? "Something went wrong.");
      }
    });
  }

  const interviewerMembers = members.map(toInterviewerOption);

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
    >
      <DialogContent
        className="sm:max-w-lg"
        onOpenAutoFocus={() => {
          if (task) syncFrom(task);
        }}
      >
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
          <DialogDescription>Update the task details below.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="edit-task-title" className="sr-only">Task title</label>
            <Input
              id="edit-task-title"
              placeholder="Task title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              className="text-base font-medium"
            />
          </div>

          <div>
            <label htmlFor="edit-task-description" className="sr-only">Description</label>
            <Textarea
              id="edit-task-description"
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="flex-1">
              <InterviewerSelect
                value={ownerId}
                onChange={setOwnerId}
                members={interviewerMembers}
                label="Assignee"
              />
            </div>

            <div className="flex-1">
              <label htmlFor="edit-task-due-date" className="mb-1.5 block text-xs font-medium text-zinc-500">
                <Calendar className="mr-1 inline size-3" />
                Due date
              </label>
              <Input
                id="edit-task-due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          <TaskLinkFields value={links} options={contextOptions} onChange={setLinks} />

          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-500">
              <Flag className="mr-1 inline size-3" />
              Priority
            </label>
            <div className="flex gap-1.5">
              {TASK_PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={priority === p}
                  onClick={() => setPriority(p)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                    priority === p
                      ? cn(PRIORITY_COLOR[p], "bg-white shadow-sm dark:bg-zinc-800")
                      : "border-transparent text-zinc-500 hover:text-zinc-700",
                  )}
                >
                  {TASK_PRIORITY_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600">{error}</p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !title.trim()}>
              {pending ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : null}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
