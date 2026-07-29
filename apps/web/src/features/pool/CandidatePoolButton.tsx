"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/notification-island/toast";

import { addToPoolAction, removeFromPoolAction } from "@/features/pool/actions";
import { Button } from "@/components/ui/button";
import { BookmarkSimpleIcon } from "@/components/ui/icons/phosphor";
import { cn } from "@/lib/utils";

type CandidatePoolButtonProps = {
  candidateId: string;
  inPool: boolean;
  size?: "sm" | "default" | "icon";
  variant?: "default" | "outline" | "ghost";
  className?: string;
};

export function CandidatePoolButton({
  candidateId,
  inPool: initialInPool,
  size = "sm",
  variant = "outline",
  className,
}: CandidatePoolButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [inPool, setInPool] = useState(initialInPool);

  function toggle() {
    startTransition(async () => {
      const result = inPool
        ? await removeFromPoolAction({ candidateId })
        : await addToPoolAction({ candidateId, source: "sourced" });

      if (!result.success) {
        toast.error(result.error ?? "Could not update pool status.");
        return;
      }

      setInPool(!inPool);
      toast.success(inPool ? "Removed from pool." : "Added to pool.");
      (router as { refresh?: () => void }).refresh?.();
    });
  }

  return (
    <Button
      size={size}
      variant={variant}
      onClick={toggle}
      disabled={isPending}
      className={cn(
        inPool && "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800",
        className,
      )}
      title={inPool ? "Remove from pool" : "Add to pool"}
    >
      {inPool ? (
        <>
          <BookmarkSimpleIcon className="size-4 fill-current" />
          {size !== "icon" && <span className="ml-1.5">In Pool</span>}
        </>
      ) : (
        <>
          <BookmarkSimpleIcon className="size-4" />
          {size !== "icon" && <span className="ml-1.5">Add to Pool</span>}
        </>
      )}
    </Button>
  );
}
