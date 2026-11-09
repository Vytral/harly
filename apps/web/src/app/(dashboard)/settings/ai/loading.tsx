import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors settings/ai/page.tsx → AiSettingsCard: a provider status card
 * (header with actions + provider stat strip), an "AI features" card of
 * switch rows, and the "Works with your provider" tile card.
 */
export default async function AiSettingsLoading() {
  const t = await getTranslations("pages.settingsAi.loading");
  return (
    <div aria-busy="true" className="space-y-5">
      <span className="sr-only">{t("label")}</span>

      <Card className="gap-0 overflow-hidden p-0">
        <div className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-btn)] border border-hairline bg-pure-snow">
                <Skeleton className="size-5 rounded-sm" />
              </div>
              <div className="space-y-2 pt-0.5">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-10" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
                <Skeleton className="h-3.5 w-[28rem] max-w-full" />
                <Skeleton className="h-3.5 w-80 max-w-full" />
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Skeleton className="h-9 w-28 rounded-[var(--radius-btn)]" />
              <Skeleton className="h-9 w-20 rounded-[var(--radius-btn)]" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 divide-y border-t border-hairline bg-card-inset sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2 px-6 py-3.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>
      </Card>

      <Card className="gap-0 py-0">
        <div className="px-5 pt-5 pb-1">
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="divide-y divide-hairline">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-6 px-5 py-4">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-btn)] border border-hairline bg-pure-snow">
                  <Skeleton className="size-4 rounded-sm" />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-64 max-w-full" />
                </div>
              </div>
              {i > 1 ? <Skeleton className="h-5 w-9 shrink-0 rounded-full" /> : null}
            </div>
          ))}
        </div>
      </Card>

      <Card className="gap-4 py-5">
        <div className="space-y-2 px-6">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3.5 w-full max-w-xl" />
        </div>
        <div className="grid grid-cols-2 gap-2.5 px-6 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-[var(--radius-inner)]" />
          ))}
        </div>
      </Card>

      {/* AssistantBrandingCard: header, then name / avatar / powered-by rows. */}
      <Card className="gap-0 overflow-hidden p-0">
        <div className="space-y-2 px-6 pt-6 pb-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3.5 w-80 max-w-full" />
        </div>
        <div className="divide-y divide-hairline border-t border-hairline">
          {["name", "avatar", "powered"].map((row) => (
            <div key={row} className="flex items-center justify-between gap-6 px-6 py-4">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3 w-56 max-w-full" />
              </div>
              {row === "name" ? (
                <Skeleton className="h-9 w-56 shrink-0 rounded-[var(--radius-btn)]" />
              ) : row === "avatar" ? (
                <Skeleton className="size-10 shrink-0 rounded-full" />
              ) : (
                <Skeleton className="h-5 w-9 shrink-0 rounded-full" />
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
