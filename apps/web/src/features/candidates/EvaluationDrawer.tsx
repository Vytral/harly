"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { stageLabel } from "@/features/pipeline/stage-label";
import { Minus, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import {
  createScorecard,
  refineScorecardTextAction,
  suggestScorecardAttributesAction,
  type ScorecardAttribute,
} from "@/features/candidates/actions";
import { useAdvanceAfterDecision } from "@/features/candidates/queue-navigation-context";
import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import { Textarea } from "@/components/ui/textarea";
import {
  MagicWandDuotoneIcon,
  SparkleFillIcon,
  SpinnerIcon,
} from "@/components/ui/icons/phosphor";
import { useAiEnabled } from "@/components/ai/AiAvailability";
import { cn } from "@/lib/utils";

const RATINGS = [
  { key: "strong", icon: ThumbsUp },
  { key: "mixed", icon: Minus },
  { key: "weak", icon: ThumbsDown },
] as const;

type RatingKey = (typeof RATINGS)[number]["key"];

export function EvaluationDrawer({
  candidateId,
  workspaceId,
  applicationId,
  stageId,
  stageName,
  trigger,
}: {
  candidateId: string;
  workspaceId: string;
  applicationId: string;
  stageId?: string | null;
  stageName: string | null;
  trigger: ReactNode;
}) {
  const t = useTranslations("features.candidates.EvaluationDrawer");
  const tStages = useTranslations("labels.pipeline.stages");
  const aiEnabled = useAiEnabled();
  const advance = useAdvanceAfterDecision();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<RatingKey | null>(null);
  const [comment, setComment] = useState("");
  const [isPending, startTransition] = useTransition();

  const [attributes, setAttributes] = useState<ScorecardAttribute[] | null>(
    null,
  );
  const [suggesting, startSuggest] = useTransition();
  const [refining, startRefine] = useTransition();

  function suggestAttributes() {
    startSuggest(async () => {
      const result = await suggestScorecardAttributesAction({ candidateId });
      if (!result.ok) {
        toast.error(result.error ?? t("suggestError"));
        return;
      }
      if (result.attributes.length === 0) {
        toast.message(t("noAttributes"), {
          description: t("noAttributesHint"),
        });
        return;
      }
      setAttributes(result.attributes);
    });
  }

  /** Insert an attribute as a labelled prompt the interviewer fills in. */
  function addAttribute(attr: ScorecardAttribute) {
    setComment((prev) => {
      // Dedup on the label itself (any line already starting "Label:"),
      // independent of trailing whitespace the interviewer may have edited.
      const already = prev
        .split("\n")
        .some((l) =>
          l
            .trimStart()
            .toLowerCase()
            .startsWith(`${attr.label.toLowerCase()}:`),
        );
      if (already) return prev;
      const prefix = prev.trim() ? `${prev.replace(/\s+$/, "")}\n\n` : "";
      return `${prefix}${attr.label}: `;
    });
    setAttributes(
      (prev) => prev?.filter((a) => a.label !== attr.label) ?? null,
    );
  }

  function refine() {
    if (!comment.trim()) {
      toast.error(t("writeCommentFirst"));
      return;
    }
    startRefine(async () => {
      const result = await refineScorecardTextAction({ comment, candidateId });
      if (!result.ok) {
        toast.error(result.error ?? t("refineError"));
        return;
      }
      setComment(result.refined);
      toast.success(t("refined"));
    });
  }

  function submit() {
    if (!rating) {
      toast.error(t("pickRating"));
      return;
    }
    startTransition(async () => {
      const result = await createScorecard({
        candidateId,
        workspaceId,
        applicationId,
        stageId,
        rating,
        comment: comment.trim() || undefined,
      });
      if (!result.success) {
        toast.error(result.error ?? t("saveError"));
        return;
      }
      setOpen(false);
      setRating(null);
      setComment("");
      setAttributes(null);
      // In the review queue an evaluation is the decision: go on to the next item.
      if (!advance(applicationId, () => t("saved"))) {
        toast.success(t("saved"));
      }
    });
  }

  return (
    <SidePanel
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={stageName ? t("titleWithStage", { stage: stageLabel(stageName, tStages) }) : t("title")}
      description={t("description")}
      footer={
        <>
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() => setOpen(false)}
          >
            {t("cancel")}
          </Button>
          <Button onClick={submit} disabled={isPending}>
            {isPending ? t("saving") : t("save")}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="text-[13px] font-medium tracking-tight text-foreground/90">
            {t("overallRating")}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {RATINGS.map((r) => {
              const active = rating === r.key;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setRating(r.key)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-sm font-medium transition-colors",
                    active
                      ? "border-primary/40 bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  <r.icon className="size-5" strokeWidth={1.8} />
                  {t(`ratings.${r.key}`)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="evaluation-comment"
              className="text-[13px] font-medium tracking-tight text-foreground/90"
            >
              {t("comments")}
            </label>
{aiEnabled ? (
            <button
              type="button"
              onClick={suggestAttributes}
              disabled={suggesting}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border border-transparent px-2.5 py-1",
                "text-xs font-medium text-pine transition-[transform,background-color,color]",
                "duration-150 ease-out hover:bg-sage/50 active:scale-[0.97]",
                "disabled:pointer-events-none disabled:opacity-60",
              )}
            >
              {suggesting ? (
                <SpinnerIcon className="size-3.5 animate-spin" />
              ) : (
                <SparkleFillIcon className="size-3.5" />
              )}
              {suggesting ? t("thinking") : t("suggestAttributes")}
            </button>
) : null}
          </div>

          {attributes && attributes.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pb-0.5">
              {attributes.map((attr, i) => (
                <button
                  key={attr.label}
                  type="button"
                  onClick={() => addAttribute(attr)}
                  title={attr.whatGoodLooksLike}
                  style={{ animationDelay: `${i * 40}ms` }}
                  className={cn(
                    "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1",
                    "inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-1",
                    "text-xs font-medium text-foreground/80 transition-[transform,background-color,border-color]",
                    "duration-150 ease-out hover:border-pine/40 hover:bg-sage/40 active:scale-[0.97]",
                  )}
                >
                  <span className="text-pine/70">+</span>
                  {attr.label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="relative">
            <Textarea
              id="evaluation-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t("commentPlaceholder")}
              className={aiEnabled ? "min-h-32 pb-11" : "min-h-32"}
            />
{aiEnabled ? (
            <button
              type="button"
              onClick={refine}
              disabled={refining || !comment.trim()}
              className={cn(
                "absolute bottom-2.5 right-2.5 inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5",
                "text-xs font-medium text-foreground/80 shadow-sm transition-[transform,background-color,color]",
                "duration-150 ease-out hover:bg-muted active:scale-[0.97]",
                "disabled:pointer-events-none disabled:opacity-50",
              )}
            >
              {refining ? (
                <SpinnerIcon className="size-3.5 animate-spin" />
              ) : (
                <MagicWandDuotoneIcon className="size-3.5" />
              )}
              {refining ? t("refining") : t("refineWithAi")}
            </button>
) : null}
          </div>
{aiEnabled ? (
          <p className="text-xs text-muted-foreground">
            {t("refineHint")}
          </p>
) : null}
        </div>
      </div>
    </SidePanel>
  );
}
