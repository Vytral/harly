"use client";

import { useState, useTransition } from "react";
import { Calendar, Flag, Loader2 } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { InterviewerSelect } from "@/features/candidates/InterviewerSelect";
import { TaskLinkFields, type TaskContextOptions, type TaskLinkValues } from "./TaskLinkFields";
import { createTask } from "./actions";
import type { TaskPriority, TaskStatus } from "./shared";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "./shared";

type Member = { id: string; name: string; image: string | null };

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  low: "border-zinc-300 text-zinc-500",
  medium: "border-blue-300 text-blue-600",
  high: "border-orange-300 text-orange-600",
  urgent: "border-red-300 text-red-600",
};

export function CreateTaskDialog({
  open,
  onOpenChange,
  members,
  contextOptions,
  defaultStatus = "pending",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
  contextOptions: TaskContextOptions;
  defaultStatus?: TaskStatus;
}) {
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [ownerId, setOwnerId] = useState(members[0]?.id ?? "");
  const [links, setLinks] = useState<TaskLinkValues>({
    candidateId: null,
    applicationId: null,
    jobId: null,
    interviewId: null,
  });
  const [error, setError] = useState<string | null>(null);

  const interviewerOptions = members.map((m) => ({
    userId: m.id,
    name: m.name,
    image: m.image,
  }));

  function reset() {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setDueDate("");
    setOwnerId(members[0]?.id ?? "");
    setLinks({ candidateId: null, applicationId: null, jobId: null, interviewId: null });
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createTask({
        title,
        description: description || undefined,
        priority,
        status: defaultStatus,
        dueDate: dueDate || undefined,
        ownerId,
        candidateId: links.candidateId,
        applicationId: links.applicationId,
        jobId: links.jobId,
        interviewId: links.interviewId,
      });

      if (result.success) {
        toast.success("Task created");
        reset();
        onOpenChange(false);
      } else {
        setError(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>
            {defaultStatus === "pending"
              ? "Add a task with an assignee, priority, and due date."
              : `Adds to "${TASK_STATUS_LABELS[defaultStatus]}". Set an assignee, priority, and due date.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="new-task-title" className="sr-only">Task title</label>
            <Input
              id="new-task-title"
              placeholder="Task title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              className="text-base font-medium"
            />
          </div>

          <div>
            <label htmlFor="new-task-description" className="sr-only">Description</label>
            <Textarea
              id="new-task-description"
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
                members={interviewerOptions}
                label="Assignee"
              />
            </div>

            <div className="flex-1">
              <label htmlFor="new-task-due-date" className="mb-1.5 block text-xs font-medium text-zinc-500">
                <Calendar className="mr-1 inline size-3" />
                Due date
              </label>
              <Input
                id="new-task-due-date"
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
              Create task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
