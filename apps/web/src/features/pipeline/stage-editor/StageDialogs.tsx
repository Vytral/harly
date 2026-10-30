"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { mergeMessage, planArchive, type EditorStage } from "./model";

/**
 * Archive flow. A stage with no candidates gets a plain confirm. A stage with
 * candidates must pick a merge target, filtered to the targets the rules allow;
 * when none exists, the dialog explains what to add and offers no action.
 */
export function ArchiveStageDialog({
  stage,
  stages,
  busy,
  notice,
  onCancel,
  onConfirm,
}: {
  stage: EditorStage | null;
  stages: readonly EditorStage[];
  busy: boolean;
  notice: string | null;
  onCancel: () => void;
  onConfirm: (mergeIntoStageId: string | null) => void;
}) {
  const plan = stage ? planArchive(stage, stages) : null;
  const [chosen, setChosen] = useState<string | null>(null);

  const targetId =
    plan?.mode === "merge"
      ? plan.targets.some((target) => target.id === chosen)
        ? chosen
        : plan.defaultTargetId
      : null;
  const target =
    plan?.mode === "merge" ? plan.targets.find((candidate) => candidate.id === targetId) : undefined;

  return (
    <Dialog open={stage !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Archive {stage?.name ?? "stage"}?</DialogTitle>
          <DialogDescription>
            Archived stages leave the board and the stage pickers. Their history is kept. Archived
            stages cannot be restored from the editor.
          </DialogDescription>
        </DialogHeader>

        {plan?.mode === "merge" && stage ? (
          <div className="space-y-2">
            <p className="text-sm text-foreground">
              {mergeMessage(stage.applicationCount, target?.name ?? "another stage")}
            </p>
            <Label htmlFor="archive-merge-target" className="text-xs text-muted-foreground">
              Move candidates to
            </Label>
            <Select value={targetId ?? undefined} onValueChange={setChosen} disabled={busy}>
              <SelectTrigger id="archive-merge-target" className="w-full">
                <SelectValue placeholder="Choose a stage" />
              </SelectTrigger>
              <SelectContent>
                {plan.targets.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {plan?.mode === "blocked" ? (
          <p className="flex items-start gap-2 rounded-xl bg-muted px-3 py-2.5 text-sm text-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            <span>{plan.reason}</span>
          </p>
        ) : null}

        {notice ? (
          <p role="alert" className="text-sm text-destructive">
            {notice}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            {plan?.mode === "blocked" ? "Close" : "Cancel"}
          </Button>
          {plan?.mode === "blocked" ? null : (
            <Button
              type="button"
              disabled={busy || (plan?.mode === "merge" && !targetId)}
              onClick={() => onConfirm(plan?.mode === "merge" ? targetId : null)}
            >
              {busy ? "Archiving…" : "Archive stage"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Delete confirm. The server refuses a stage that was ever used; that reason is shown inline. */
export function DeleteStageDialog({
  stage,
  busy,
  notice,
  onCancel,
  onConfirm,
}: {
  stage: EditorStage | null;
  busy: boolean;
  notice: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={stage !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {stage?.name ?? "stage"}?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the stage for good. It is only possible for a stage no candidate has ever
            been in. Otherwise, archive it instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {notice ? (
          <p role="alert" className="text-sm text-destructive">
            {notice}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} onClick={onCancel}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={(event) => {
              // Keep the dialog open until the server answers; the editor closes it.
              event.preventDefault();
              onConfirm();
            }}
          >
            {busy ? "Deleting…" : "Delete stage"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
