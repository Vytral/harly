"use client";

import { useState, useTransition } from "react";
import { Calendar, Flag, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/notification-island/toast";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { InterviewerSelect } from "@/features/candidates/InterviewerSelect";
import { TaskLinkFields, type TaskContextOptions, type TaskLinkValues } from "./TaskLinkFields";
import { createTask } from "./actions";
import type { TaskPriority, TaskStatus } from "./shared";
import { TASK_PRIORITIES } from "./shared";

type Member = { id: string; name: string; image: string | null };

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  low: "border-hairline text-soft-ink",
  medium: "border-status-quiet-ink/40 text-status-quiet-ink",
  high: "border-warning/40 text-warning",
  urgent: "border-destructive/40 text-destructive",
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
  const t = useTranslations("features.tasks.createTaskDialog");
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
        toast.success(t("toastCreated"));
        reset();
        onOpenChange(false);
      } else {
        setError(result.error ?? t("somethingWentWrong"));
      }
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription>
            {defaultStatus === "pending"
              ? t("subtitle")
              : t("subtitleWithStatus", { status: t(`statuses.${defaultStatus}`) })}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-5">
          <div>
            <label htmlFor="new-task-title" className="sr-only">{t("taskTitle")}</label>
            <Input
              id="new-task-title"
              placeholder={t("taskTitle")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              className="text-base font-medium"
            />
          </div>

          <div>
            <label htmlFor="new-task-description" className="sr-only">{t("descriptionLabel")}</label>
            <Textarea
              id="new-task-description"
              placeholder={t("descriptionPlaceholder")}
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
                label={t("assignee")}
              />
            </div>

            <div className="flex-1">
              <label htmlFor="new-task-due-date" className="mb-1.5 block text-[12.5px] font-medium text-soft-ink">
                <Calendar className="mr-1 inline size-3" />
                {t("dueDate")}
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
            <label className="mb-1.5 block text-[12.5px] font-medium text-soft-ink">
              <Flag className="mr-1 inline size-3" />
              {t("priority")}
            </label>
            <div className="flex gap-1.5">
              {TASK_PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={priority === p}
                  onClick={() => setPriority(p)}
                  className={cn(
                    "rounded-[var(--radius-btn)] border px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                    priority === p
                      ? cn(PRIORITY_COLOR[p], "bg-pure-snow")
                      : "border-transparent bg-card-inset text-soft-ink hover:text-near-ink",
                  )}
                >
                  {t(`priorities.${p}`)}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">{error}</p>
          )}

          </div>

          <SheetFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              {t("discard")}
            </Button>
            <Button type="submit" disabled={pending || !title.trim()}>
              {pending ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : null}
              {t("saveTask")}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
