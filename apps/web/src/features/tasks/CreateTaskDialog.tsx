"use client";

import { useState, useTransition } from "react";
import { Calendar, Check, ChevronsUpDown, Flag, Loader2, User } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { InterviewerSelect } from "@/features/candidates/InterviewerSelect";
import { createTask } from "./actions";
import type { TaskPriority, TaskStatus } from "./shared";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "./shared";

type Member = { id: string; name: string; image: string | null };
type CandidateOption = { id: string; firstName: string; lastName: string; avatarUrl: string | null };

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  low: "border-zinc-300 text-zinc-500",
  medium: "border-blue-300 text-blue-600",
  high: "border-orange-300 text-orange-600",
  urgent: "border-red-300 text-red-600",
};

function CandidateCombobox({
  value,
  onChange,
  candidates,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  candidates: CandidateOption[];
}) {
  const [open, setOpen] = useState(false);

  const selected = candidates.find((c) => c.id === value);
  const selectedName = selected ? `${selected.firstName} ${selected.lastName}` : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {selected ? (
            <span className="flex items-center gap-2">
              <UserAvatar
                name={selectedName!}
                src={selected.avatarUrl}
                size="sm"
                className="size-5 text-[10px]"
              />
              <span className="truncate">{selectedName}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Link a candidate (optional)</span>
          )}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search candidates..." />
          <CommandList>
            <CommandEmpty>No candidates found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="none"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="flex items-center gap-2"
              >
                <User className="size-5 text-muted-foreground" />
                <span className="flex-1">None</span>
                <Check className={cn("size-4", !value ? "opacity-100" : "opacity-0")} />
              </CommandItem>
              {candidates.map((c) => {
                const name = `${c.firstName} ${c.lastName}`;
                return (
                  <CommandItem
                    key={c.id}
                    value={name}
                    onSelect={() => {
                      onChange(c.id);
                      setOpen(false);
                    }}
                    className="flex items-center gap-2"
                  >
                    <UserAvatar name={name} src={c.avatarUrl} size="sm" className="size-5 text-[10px]" />
                    <span className="flex-1 truncate">{name}</span>
                    <Check className={cn("size-4", value === c.id ? "opacity-100" : "opacity-0")} />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function CreateTaskDialog({
  open,
  onOpenChange,
  members,
  candidates = [],
  defaultStatus = "pending",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
  candidates?: CandidateOption[];
  defaultStatus?: TaskStatus;
}) {
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [ownerId, setOwnerId] = useState(members[0]?.id ?? "");
  const [candidateId, setCandidateId] = useState<string | null>(null);
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
    setCandidateId(null);
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
        candidateId: candidateId ?? undefined,
      });

      if (result.success) {
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
            <Input
              placeholder="Task title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              className="text-base font-medium"
            />
          </div>

          <div>
            <Textarea
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
              <label className="mb-1.5 block text-xs font-medium text-zinc-500">
                <Calendar className="mr-1 inline size-3" />
                Due date
              </label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-500">
              <User className="mr-1 inline size-3" />
              Candidate
            </label>
            <CandidateCombobox
              value={candidateId}
              onChange={setCandidateId}
              candidates={candidates}
            />
          </div>

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
            <p className="text-sm text-red-600">{error}</p>
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
