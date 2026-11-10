"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
  const t = useTranslations("features.pipeline.StageDialogs");
  const labels = useTranslations("labels.pipeline.stageEditor");
  const kindNames = useTranslations("labels.pipeline.stageKinds");
  const plan = stage ? planArchive(stage, stages, labels, kindNames(stage.kind)) : null;
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
        <DialogHeader align="start">
          <DialogTitle>{t("archiveTitle", { name: stage?.name ?? t("stageFallback") })}</DialogTitle>
          <DialogDescription>{t("archiveDescription")}</DialogDescription>
        </DialogHeader>

        {plan?.mode === "merge" && stage ? (
          <div className="space-y-2">
            <p className="text-sm text-foreground">
              {mergeMessage(stage.applicationCount, target?.name ?? t("anotherStage"), labels)}
            </p>
            <Label htmlFor="archive-merge-target" className="text-xs text-muted-foreground">
              {t("moveCandidatesTo")}
            </Label>
            <Select value={targetId ?? undefined} onValueChange={setChosen} disabled={busy}>
              <SelectTrigger id="archive-merge-target" className="w-full">
                <SelectValue placeholder={t("chooseStage")} />
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
          <p className="flex items-start gap-2 rounded-[var(--radius-inner)] bg-card-inset px-3 py-2.5 text-sm text-foreground">
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
            {plan?.mode === "blocked" ? t("close") : t("cancel")}
          </Button>
          {plan?.mode === "blocked" ? null : (
            <Button
              type="button"
              disabled={busy || (plan?.mode === "merge" && !targetId)}
              onClick={() => onConfirm(plan?.mode === "merge" ? targetId : null)}
            >
              {busy ? t("archiving") : t("archiveStage")}
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
  const t = useTranslations("features.pipeline.StageDialogs");
  return (
    <ConfirmDialog
      open={stage !== null}
      onOpenChange={(open) => !open && onCancel()}
      tone="destructive"
      title={t("deleteTitle", { name: stage?.name ?? t("stageFallback") })}
      description={t("deleteDescription")}
      confirmLabel={t("deleteStage")}
      busy={busy}
      // Stay open until the server answers; the editor closes it.
      closeOnConfirm={false}
      onConfirm={onConfirm}
    >
      {notice ? <Callout tone="danger">{notice}</Callout> : null}
    </ConfirmDialog>
  );
}
