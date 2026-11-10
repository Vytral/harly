import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors settings/updates/page.tsx: the UpdatesPanel card (version header,
 * status block, history list) followed by the AutoUpdateCard.
 */
export default async function UpdatesSettingsLoading() {
  const t = await getTranslations("pages.settingsUpdates.loading");

  return (
    <div aria-busy="true" className="space-y-6">
      <span className="sr-only">{t("label")}</span>

      <Card className="gap-5 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <Skeleton className="size-10 shrink-0 rounded-[var(--radius-btn)]" />
            <div className="min-w-0 space-y-2 pt-0.5">
              <Skeleton className="h-4 w-36 max-w-full" />
              <Skeleton className="h-3.5 w-64 max-w-full" />
            </div>
          </div>
          <Skeleton className="h-9 w-32 shrink-0 rounded-[var(--radius-btn)]" />
        </div>
        <div className="space-y-3 rounded-[var(--radius-inner)] border border-hairline p-4">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-3 w-72 max-w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-24" />
          <div className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0 space-y-1.5">
                  <Skeleton className="h-3.5 w-36" />
                  <Skeleton className="h-3 w-52 max-w-full" />
                </div>
                <Skeleton className="h-5 w-20 shrink-0 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card className="gap-4 p-6">
        <div className="flex items-center justify-between gap-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3.5 w-72 max-w-full" />
          </div>
          <Skeleton className="h-5 w-9 shrink-0 rounded-full" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-9 w-full rounded-[var(--radius-btn)]" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
