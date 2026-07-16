"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Minus, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";

import {
  createScorecard,
  refineScorecardTextAction,
  suggestScorecardAttributesAction,
  type ScorecardAttribute,
} from "@/features/candidates/actions";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  MagicWandDuotoneIcon,
  SparkleFillIcon,
  SpinnerIcon,
} from "@/components/ui/icons/phosphor";
import { cn } from "@/lib/utils";

const RATINGS = [
  { key: "strong", label: "Strong", icon: ThumbsUp },
  { key: "mixed", label: "Mixed", icon: Minus },
  { key: "weak", label: "Weak", icon: ThumbsDown },
] as const;

type RatingKey = (typeof RATINGS)[number]["key"];

export function EvaluationDrawer({
  candidateId,
  workspaceId,
  stageName,
  trigger,
}: {
  candidateId: string;
  workspaceId: string;
  stageName: string | null;
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<RatingKey | null>(null);
  const [comment, setComment] = useState("");
  const [isPending, startTransition] = useTransition();

  const [attributes, setAttributes] = useState<ScorecardAttribute[] | null>(null);
  const [suggesting, startSuggest] = useTransition();
  const [refining, startRefine] = useTransition();

  function suggestAttributes() {
    startSuggest(async () => {
      const result = await suggestScorecardAttributesAction({ candidateId });
      if (!result.ok) {
        toast.error(result.error ?? "Could not suggest attributes.");
        return;
      }
      if (result.attributes.length === 0) {
        toast.message("No attributes suggested", {
          description: "Try again or add your own below.",
        });
        return;
      }
      setAttributes(result.attributes);
    });
  }

  /** Insert an attribute as a labelled prompt the interviewer fills in. */
  function addAttribute(attr: ScorecardAttribute) {
    setComment((prev) => {
      const line = `${attr.label}: `;
      if (prev.includes(`\n${line}`) || prev.startsWith(line)) return prev;
      const prefix = prev.trim() ? `${prev.replace(/\s+$/, "")}\n\n` : "";
      return `${prefix}${line}`;
    });
    setAttributes((prev) => prev?.filter((a) => a.label !== attr.label) ?? null);
  }

  function refine() {
    if (!comment.trim()) {
      toast.error("Write a comment to refine first.");
      return;
    }
    startRefine(async () => {
      const result = await refineScorecardTextAction({ comment, candidateId });
      if (!result.ok) {
        toast.error(result.error ?? "Could not refine.");
        return;
      }
      setComment(result.refined);
      toast.success("Comment refined");
    });
  }

  function submit() {
    if (!rating) {
      toast.error("Pick an overall rating first.");
      return;
    }
    startTransition(async () => {
      const result = await createScorecard({
        candidateId,
        workspaceId,
        rating,
        comment: comment.trim() || undefined,
        stageName,
      });
      if (!result.success) {
        toast.error(result.error ?? "Could not save the evaluation.");
        return;
      }
      toast.success("Evaluation saved");
      setOpen(false);
      setRating(null);
      setComment("");
      setAttributes(null);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <DrawerLayout
        title={`Add evaluation${stageName ? ` · ${stageName}` : ""}`}
        description="Rate this candidate and leave feedback for the team."
        footer={
          <>
            <SheetClose asChild>
              <Button variant="outline" disabled={isPending}>
                Cancel
              </Button>
            </SheetClose>
            <Button onClick={submit} disabled={isPending}>
              {isPending ? "Saving…" : "Save evaluation"}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-[13px] font-medium tracking-tight text-foreground/90">
              Overall rating
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
                    {r.label}
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
                Comments
              </label>
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
                {suggesting ? "Thinking…" : "Suggest attributes"}
              </button>
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
                placeholder="Strengths, concerns, and your recommendation…"
                className="min-h-32 pb-11"
              />
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
                {refining ? "Refining…" : "Refine with AI"}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              AI cleans up grammar and clarity without changing your judgement.
            </p>
          </div>
        </div>
      </DrawerLayout>
    </Sheet>
  );
}
