import { getTranslations } from "next-intl/server";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors settings/ai/configure/page.tsx: a ghost back link, then the
 * DrawerLayout page section (bordered title header + provider/model/key fields,
 * the enabled switch row, and the Cancel/Save footer).
 */
export default async function ConfigureAiSettingsLoading() {
  const t = await getTranslations("pages.settingsAiConfigure.loading");
  return (
    <div aria-busy="true" className="space-y-5">
      <span className="sr-only">{t("label")}</span>

      <div className="-ml-3 flex h-8 w-fit items-center px-3">
        <Skeleton className="h-4 w-28" />
      </div>

      <section className="mx-auto w-full max-w-4xl space-y-6">
        <header className="space-y-2 border-b border-hairline pb-5">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3.5 w-96 max-w-full" />
        </header>

        <div className="max-w-3xl space-y-5">
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-9 w-full rounded-[var(--radius-btn)]" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-9 w-full rounded-[var(--radius-btn)]" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-9 w-full rounded-[var(--radius-btn)]" />
            <Skeleton className="h-3 w-72 max-w-full" />
          </div>

          <div className="flex items-center justify-between gap-6 rounded-[var(--radius-inner)] border border-hairline px-5 py-4">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-36" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
            <Skeleton className="h-5 w-9 shrink-0 rounded-full" />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-hairline pt-5">
            <Skeleton className="h-9 w-24 rounded-[var(--radius-btn)]" />
            <Skeleton className="h-9 w-32 rounded-[var(--radius-btn)]" />
          </div>
        </div>
      </section>
    </div>
  );
}
