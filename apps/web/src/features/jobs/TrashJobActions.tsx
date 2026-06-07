"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { permanentlyDeleteJobAction, restoreJobAction } from "./actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

  function deleteForever() {
    startTransition(async () => {
      const result = await permanentlyDeleteJobAction(jobId);
      if (result.success) {
        toast.success("Job deleted permanently.");
        setConfirmOpen(false);
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not delete the job.");
      }
    });
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

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete permanently?</DialogTitle>
            <DialogDescription>
              “{jobTitle}” will be removed for good. This can&apos;t be undone.
              Jobs with applications can&apos;t be deleted — close them instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={deleteForever}
              disabled={isPending}
            >
              {isPending ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
