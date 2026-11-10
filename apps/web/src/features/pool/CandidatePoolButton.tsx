"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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

/** Shared add/remove-from-pool logic, used by the button and the ⋯ menu item. */
export function useCandidatePool(candidateId: string, initialInPool: boolean) {
  const t = useTranslations("features.pool.CandidatePoolButton");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [inPool, setInPool] = useState(initialInPool);

  function toggle() {
    startTransition(async () => {
      const result = inPool
        ? await removeFromPoolAction({ candidateId })
        : await addToPoolAction({ candidateId, source: "sourced" });

      if (!result.success) {
        toast.error(result.error ?? t("couldNotUpdate"));
        return;
      }

      setInPool(!inPool);
      toast.success(inPool ? t("removed") : t("added"));
      (router as { refresh?: () => void }).refresh?.();
    });
  }

  return { inPool, isPending, toggle };
}

export function CandidatePoolButton({
  candidateId,
  inPool: initialInPool,
  size = "sm",
  variant = "outline",
  className,
}: CandidatePoolButtonProps) {
  const t = useTranslations("features.pool.CandidatePoolButton");
  const { inPool, isPending, toggle } = useCandidatePool(
    candidateId,
    initialInPool,
  );

  return (
    <Button
      size={size}
      variant={variant}
      onClick={toggle}
      disabled={isPending}
      className={cn(
        inPool && "border-warning-clay/40 bg-warning-clay/10 text-warning-clay hover:bg-warning-clay/20 hover:text-warning-clay",
        className,
      )}
      title={inPool ? t("titleRemove") : t("titleAdd")}
    >
      {inPool ? (
        <>
          <BookmarkSimpleIcon className="size-4 fill-current" />
          {size !== "icon" && <span className="ml-1.5">{t("labelInPool")}</span>}
        </>
      ) : (
        <>
          <BookmarkSimpleIcon className="size-4" />
          {size !== "icon" && <span className="ml-1.5">{t("labelAdd")}</span>}
        </>
      )}
    </Button>
  );
}
