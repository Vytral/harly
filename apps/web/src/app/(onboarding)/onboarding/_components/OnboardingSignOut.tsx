"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";

import { signOut } from "@/lib/auth-client";

export function OnboardingSignOut() {
  const t = useTranslations("accessNoWorkspace");
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(async () => void (await signOut()))}
      className="text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
    >
      {isPending ? t("signingOut") : t("signOut")}
    </button>
  );
}
