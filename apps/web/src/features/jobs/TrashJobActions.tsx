"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import { permanentlyDeleteJobAction, restoreJobAction } from "./actions";
import { getJobActionErrorKey } from "./action-errors";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function TrashJobActions({
  jobId,
  jobTitle,
}: {
  jobId: string;
  jobTitle: string;
}) {
  const t = useTranslations("jobs.trashActions");
  const tErrors = useTranslations("jobs.errors");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function restore() {
    startTransition(async () => {
      const result = await restoreJobAction(jobId);
      if (result.success) {
        toast.success(t("restored"));
        router.refresh();
      } else {
        const errorKey = getJobActionErrorKey(result.code);
        toast.error(errorKey ? tErrors(errorKey) : t("restoreError"));
      }
    });
  }

  async function deleteForever() {
    const result = await permanentlyDeleteJobAction(jobId);
    if (result.success) {
      toast.success(t("deleted"));
      router.refresh();
    } else {
      const errorKey = getJobActionErrorKey(result.code);
      const message = errorKey ? tErrors(errorKey) : t("deleteError");
      toast.error(message);
      // Keep the dialog open so the user can read the error and retry.
      throw new Error(message);
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={restore}
        disabled={isPending}
      >
        <RotateCcw className="size-4" />
        {t("restore")}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground hover:text-destructive"
        onClick={() => setConfirmOpen(true)}
        disabled={isPending}
        aria-label={t("deletePermanently")}
      >
        <Trash2 className="size-4" />
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        tone="destructive"
        title={t("confirmTitle")}
        description={t("confirmDescription", { jobTitle })}
        confirmLabel={t("deletePermanently")}
        onConfirm={deleteForever}
      />
    </div>
  );
}
