"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import { permanentlyDeleteJobAction, restoreJobAction } from "./actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function TrashJobActions({
  jobId,
  jobTitle,
}: {
  jobId: string;
  jobTitle: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function restore() {
    startTransition(async () => {
      const result = await restoreJobAction(jobId);
      if (result.success) {
        toast.success("Job restored.");
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not restore the job.");
      }
    });
  }

  async function deleteForever() {
    const result = await permanentlyDeleteJobAction(jobId);
    if (result.success) {
      toast.success("Job deleted permanently.");
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not delete the job.");
      // Keep the dialog open so the user can read the error and retry.
      throw new Error(result.error);
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
        Restore
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground hover:text-destructive"
        onClick={() => setConfirmOpen(true)}
        disabled={isPending}
        aria-label="Delete permanently"
      >
        <Trash2 className="size-4" />
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        tone="destructive"
        title="Delete job permanently?"
        description={`“${jobTitle}” will be removed for good. Jobs with applications can't be deleted. Close them instead. This can't be undone.`}
        confirmLabel="Delete permanently"
        onConfirm={deleteForever}
      />
    </div>
  );
}
