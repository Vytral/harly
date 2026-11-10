"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("features.candidates.trashCandidateActions");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function restore() {
    startTransition(async () => {
      const result = await restoreCandidateAction(candidateId);
      if (result.success) {
        toast.success(t("restored"));
        router.refresh();
      } else {
        toast.error(result.error ?? t("restoreError"));
      }
    });
  }

  async function deleteForever() {
    const result = await permanentlyDeleteCandidateAction(candidateId);
    if (result.success) {
      toast.success(t("deleted"));
      router.refresh();
    } else {
      toast.error(result.error ?? t("deleteError"));
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
        description={t("confirmDescription", { name: candidateName })}
        confirmLabel={t("deletePermanently")}
        onConfirm={deleteForever}
      />
    </div>
  );
}
