"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { useHarlyAI } from "@/components/dashboard/HarlyAIContext";

/**
 * Client half of the "is AI usable" source of truth. The value is computed on
 * the server in the dashboard layout (`isAiUsable(getWorkspaceAiStatus())`)
 * and passed through `HarlyAIProvider`, so it is correct on first paint.
 * Outside a provider it is `false`, the safe default.
 */
export function useAiEnabled(): boolean {
  return useHarlyAI().enabled;
}

/** Renders `children` only when AI is usable; otherwise `fallback` (default nothing). */
export function AiOnly({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return <>{useAiEnabled() ? children : fallback}</>;
}

/**
 * Calm, single-place prompt. Use sparingly (settings), not next to every
 * feature. Only admins get the link.
 */
export function ConnectAiPrompt({ className }: { className?: string }) {
  const { canConfigure } = useHarlyAI();
  const t = useTranslations("ui.aiAvailability");
  return (
    <p className={className ?? "text-sm text-muted-foreground"}>
      {canConfigure
        ? t.rich("connectPromptAdmin", {
            link: (chunks) => (
              <Link href="/settings/ai" className="underline underline-offset-2">
                {chunks}
              </Link>
            ),
          })
        : t("connectPromptMember")}
    </p>
  );
}
