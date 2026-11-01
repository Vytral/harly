"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

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
    <div className="flex flex-wrap items-center gap-2">
      {tags.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex h-6 items-center gap-1 rounded-full bg-accent px-2.5 text-xs font-medium text-accent-foreground"
        >
          {tag.label}
          <button
            type="button"
            onClick={() => remove(tag.id)}
            disabled={isPending}
            className="rounded-full text-sage-ink/60 outline-none transition-colors duration-150 hover:text-sage-ink focus-visible:ring-2 focus-visible:ring-ring"
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
          className="h-7 w-32 rounded-full px-3 text-base sm:text-xs"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed px-2.5 text-xs font-medium text-muted-foreground outline-none transition-colors duration-150 hover:border-ring/40 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Plus className="size-3" />
          Tag
        </button>
      )}
    </div>
  );
}
