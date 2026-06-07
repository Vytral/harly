"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Minus, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";

import { createScorecard } from "@/features/candidates/actions";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
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
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <DrawerLayout
        title={`Add evaluation${stageName ? ` · ${stageName}` : ""}`}
        description="Saved as a structured evaluation on this candidate."
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
            <label
              htmlFor="evaluation-comment"
              className="text-[13px] font-medium tracking-tight text-foreground/90"
            >
              Comments
            </label>
            <Textarea
              id="evaluation-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Strengths, concerns, and your recommendation…"
              className="min-h-32"
            />
          </div>
        </div>
      </DrawerLayout>
    </Sheet>
  );
}
