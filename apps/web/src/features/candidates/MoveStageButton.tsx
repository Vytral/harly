"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { moveApplicationStage } from "@/features/pipeline/actions";
import { withKeyLock } from "@/lib/client-mutex";
import { Button } from "@/components/ui/button";
import { ArrowLineRightIcon } from "@/components/ui/icons/phosphor";
import { cn } from "@/lib/utils";

export type MoveStageTarget = {
  applicationId: string;
  fromStageId: string | null;
  workspaceId: string;
  nextStage: { id: string; name: string } | null;
};

/**
 * Contextual primary CTA: advances an application to the next pipeline stage.
 * The label follows the pipeline ("Move to Phone Screen" → "Move to Assessment"…)
 * and disables once the candidate is in the final stage. Shared by the header
 * action bar and the sticky bar.
 */
export function MoveStageButton({
  target,
  size = "sm",
  className,
}: {
  target: MoveStageTarget | null;
  size?: "sm" | "default";
  className?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (!target) return null;

  const moveTarget = target;
  const { nextStage } = moveTarget;

  function move() {
    if (!nextStage) return;
    startTransition(async () => {
      const result = await withKeyLock(
        `application:${moveTarget.applicationId}`,
        () =>
          moveApplicationStage({
            applicationId: moveTarget.applicationId,
            fromStageId: moveTarget.fromStageId,
            toStageId: nextStage.id,
            workspaceId: moveTarget.workspaceId,
          }),
      );
      if (result.success) {
        toast.success(`Moved to ${nextStage.name}.`);
        (router as { refresh?: () => void }).refresh?.();
      } else {
        toast.error(result.error ?? "Could not move candidate.");
      }
    });
  }

  return (
    <Button
      size={size}
      onClick={move}
      disabled={!nextStage || isPending}
      className={cn("gap-1.5", className)}
      title={nextStage ? `Move to ${nextStage.name}` : "Already in the final stage"}
    >
      {nextStage ? (
        <>
          <span className="truncate">
            {isPending ? "Moving…" : `Move to ${nextStage.name}`}
          </span>
          <ArrowLineRightIcon className="size-4 shrink-0" />
        </>
      ) : (
        "Final stage"
      )}
    </Button>
  );
}
