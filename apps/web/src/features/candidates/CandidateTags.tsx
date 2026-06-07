"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import { addCandidateTag, removeCandidateTag } from "@/features/candidates/actions";
import { Input } from "@/components/ui/input";

export function CandidateTags({
  candidateId,
  workspaceId,
  tags,
}: {
  candidateId: string;
  workspaceId: string;
  tags: Array<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [isPending, startTransition] = useTransition();

  function add() {
    const label = draft.trim();
    if (!label) {
      setAdding(false);
      return;
    }
    startTransition(async () => {
      const result = await addCandidateTag({ candidateId, workspaceId, label });
      if (!result.success) {
        toast.error(result.error ?? "Could not add tag.");
        return;
      }
      setDraft("");
      setAdding(false);
      router.refresh();
    });
  }

  function remove(tagId: string) {
    startTransition(async () => {
      const result = await removeCandidateTag({ tagId, candidateId, workspaceId });
      if (!result.success) {
        toast.error(result.error ?? "Could not remove tag.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground"
        >
          {tag.label}
          <button
            type="button"
            onClick={() => remove(tag.id)}
            disabled={isPending}
            className="text-sage-ink/60 transition-colors hover:text-sage-ink"
            aria-label={`Remove ${tag.label}`}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      {adding ? (
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            } else if (e.key === "Escape") {
              setAdding(false);
              setDraft("");
            }
          }}
          onBlur={add}
          placeholder="Tag name…"
          className="h-7 w-32 rounded-full px-3 text-xs"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:border-ring/40 hover:text-foreground"
        >
          <Plus className="size-3" />
          Tag
        </button>
      )}
    </div>
  );
}
