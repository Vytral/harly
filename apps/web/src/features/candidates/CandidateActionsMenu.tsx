"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { restoreCandidateAction, trashCandidateAction } from "./actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type CandidateActionsMenuProps = {
  candidateId: string;
  /** When true, redirect to the candidates list after trashing (used on the detail page). */
  redirectAfterTrash?: boolean;
  align?: "start" | "end";
};

export function CandidateActionsMenu({
  candidateId,
  redirectAfterTrash = false,
  align = "end",
}: CandidateActionsMenuProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function moveToTrash() {
    startTransition(async () => {
      const result = await trashCandidateAction(candidateId);
      if (!result.success) {
        toast.error(result.error ?? "Could not move the candidate to trash.");
        return;
      }
      toast.success("Candidate moved to trash.", {
        action: {
          label: "Undo",
          onClick: () => {
            startTransition(async () => {
              await restoreCandidateAction(candidateId);
              router.refresh();
            });
          },
        },
      });
      if (redirectAfterTrash) {
        router.replace("/dashboard/candidates");
      }
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground data-[state=open]:bg-accent"
          aria-label="Candidate actions"
          disabled={isPending}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-48">
        <DropdownMenuItem variant="destructive" onClick={moveToTrash}>
          <Trash2 />
          Move to trash
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
