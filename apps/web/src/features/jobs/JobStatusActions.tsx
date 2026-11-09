"use client";

import type { Job } from "@harly/db";
import { Archive, FileEdit, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "@/lib/notification-island/toast";

import { updateJobStatusAction } from "./actions";
import { getJobActionErrorKey } from "./action-errors";
import { Button } from "@/components/ui/button";

export function JobStatusActions({ job }: { job: Job }) {
  const t = useTranslations("jobs.status");
  const tErrors = useTranslations("jobs.errors");
  const statusLabels = { draft: t("draft"), open: t("open"), closed: t("closed") };
  const actionLabels = { draft: t("moveToDraft"), open: t("publish"), closed: t("close") };
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
        toast.success(t("updated", { status: statusLabels[status as keyof typeof statusLabels] ?? status }));
        router.refresh();
      } catch (error) {
        const errorKey = getJobActionErrorKey(error instanceof Error ? error.message : null);
        toast.error(
          errorKey ? tErrors(errorKey) : t("updateError"),
        );
      }
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      {actions.map((status) => {
        const Icon = status === "draft" ? FileEdit : status === "open" ? Send : Archive;
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
            {actionLabels[status as keyof typeof actionLabels]}
          </Button>
        );
      })}
    </div>
  );
}
