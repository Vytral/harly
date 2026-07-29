"use client";

import type { Job } from "@harly/db";
import { Archive, FileEdit, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "@/lib/notification-island/toast";

import { updateJobStatusAction } from "./actions";
import { Button } from "@/components/ui/button";

const actionMeta: Record<string, { label: string; icon: typeof Send }> = {
  draft: { label: "Move to draft", icon: FileEdit },
  open: { label: "Publish", icon: Send },
  closed: { label: "Close", icon: Archive },
};

export function JobStatusActions({ job }: { job: Job }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const actions = (["draft", "open", "closed"] as const).filter(
    (status) => status !== job.status,
  );

  function changeStatus(status: string) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("jobId", job.id);
      formData.set("status", status);
      try {
        await updateJobStatusAction(formData);
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not update job status.",
        );
      }
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      {actions.map((status) => {
        const meta = actionMeta[status];
        const Icon = meta.icon;
        return (
          <Button
            key={status}
            type="button"
            variant={status === "open" ? "default" : "outline"}
            size="sm"
            className="w-full justify-start"
            disabled={isPending}
            onClick={() => changeStatus(status)}
          >
            <Icon className="size-4" />
            {meta.label}
          </Button>
        );
      })}
    </div>
  );
}
