"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import { permanentlyDeleteCandidateAction, restoreCandidateAction } from "./actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function TrashCandidateActions({
  candidateId,
  candidateName,
}: {
  candidateId: string;
  candidateName: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function restore() {
    startTransition(async () => {
      const result = await restoreCandidateAction(candidateId);
      if (result.success) {
        toast.success("Candidate restored.");
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not restore the candidate.");
      }
    });
  }

  async function deleteForever() {
    const result = await permanentlyDeleteCandidateAction(candidateId);
    if (result.success) {
      toast.success("Candidate deleted permanently.");
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not delete the candidate.");
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
        title="Delete candidate permanently?"
        description={`“${candidateName}” and all their applications, notes, files, and messages will be removed for good. Any pending erasure request will be marked fulfilled. This can't be undone.`}
        confirmLabel="Delete permanently"
        onConfirm={deleteForever}
      />
    </div>
  );
}
