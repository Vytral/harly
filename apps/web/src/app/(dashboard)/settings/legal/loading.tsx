import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors settings/legal/page.tsx → LegalSettings + DsarRequestsSection: the
 * header with status pill and save/discard actions, the Legal Entity, Data
 * Retention and Consent cards, the Legal Pages tabbed editor card, and the
 * Requests list below.
 */
export default async function LegalSettingsLoading() {
  const t = await getTranslations("pages.settingsLegal.loading");
  return (
    <div aria-busy="true" className="space-y-6">
      <span className="sr-only">{t("label")}</span>

      <div className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <Skeleton className="size-11 shrink-0 rounded-2xl" />
            <div className="space-y-2 pt-0.5">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
              <Skeleton className="h-3.5 w-[30rem] max-w-full" />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Skeleton className="h-9 w-20 rounded-[var(--radius-btn)]" />
            <Skeleton className="h-9 w-24 rounded-[var(--radius-btn)]" />
          </div>
        </div>

        <Card className="gap-3 p-5">
          <Skeleton className="h-4 w-28" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-9 w-full rounded-[var(--radius-btn)]" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Skeleton className="h-3.5 w-16" />
              <Skeleton className="h-9 w-full rounded-[var(--radius-btn)]" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-9 w-full rounded-[var(--radius-btn)]" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-9 w-full rounded-[var(--radius-btn)]" />
            </div>
          </div>
        </Card>

        <Card className="gap-3 p-5">
          <Skeleton className="h-4 w-28" />
          <div className="flex items-center justify-between gap-6 rounded-[var(--radius-inner)] border border-hairline px-5 py-4">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-72 max-w-full" />
            </div>
            <Skeleton className="h-5 w-9 shrink-0 rounded-full" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-9 w-full rounded-[var(--radius-btn)]" />
              </div>
            ))}
          </div>
        </Card>

        <Card className="gap-3 p-5">
          <Skeleton className="h-4 w-20" />
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="h-24 w-full rounded-[var(--radius-btn)]" />
          </div>
        </Card>

        <Card className="gap-0 overflow-hidden p-0">
          <div className="flex flex-col gap-3 border-b border-hairline p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-80 max-w-full" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-[180px] rounded-[var(--radius-btn)]" />
              <Skeleton className="h-8 w-32 rounded-[var(--radius-btn)]" />
            </div>
          </div>
          <div className="flex gap-1 border-b border-hairline px-6 pt-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-24 rounded-t-lg rounded-b-none" />
            ))}
          </div>
          <div className="border-b border-hairline px-6 py-2">
            <Skeleton className="h-3 w-48" />
          </div>
          <div className="p-6">
            <Skeleton className="h-[24rem] w-full rounded-xl" />
          </div>
        </Card>
      </div>

      <section className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-3.5 w-96 max-w-full" />
          </div>
          <Skeleton className="h-6 w-28 rounded-full" />
        </div>
        <div className="overflow-hidden rounded-xl border border-hairline bg-pure-snow">
          <div className="divide-y divide-hairline">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-4 px-4 py-3.5">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-56 max-w-full" />
                </div>
                <Skeleton className="h-5 w-20 shrink-0 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
