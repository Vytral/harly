import { getTranslations } from "next-intl/server";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors career-page/page.tsx → CareerPageBuilder inside FocusModeShell: the
 * top bar (exit, title, status, publish), the section rail (compact below
 * 1400px), the editor column of setting cards, and the device preview pane.
 */
export default async function CareerPageLoading() {
  const t = await getTranslations("pages.careerPage.loading");

  return (
    <div aria-busy="true" className="flex h-dvh w-full flex-col overflow-hidden bg-warm-paper">
      <span className="sr-only">{t("label")}</span>

      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-hairline bg-pure-snow/80 px-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Skeleton className="h-8 w-16 rounded-[var(--radius-btn)]" />
          <Skeleton className="hidden h-4 w-36 sm:block" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="hidden h-4 w-28 md:block" />
          <Skeleton className="h-8 w-24 rounded-[var(--radius-btn)]" />
          <Skeleton className="h-8 w-[132px] rounded-[var(--radius-btn)]" />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav className="flex shrink-0 gap-1 border-b border-hairline px-2 py-2 md:w-[76px] md:flex-col md:items-center md:border-b-0 md:border-r md:py-3 min-[87.5rem]:w-[184px] min-[87.5rem]:items-stretch min-[87.5rem]:px-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-[60px] rounded-[var(--radius-btn)] md:h-12 min-[87.5rem]:h-9 min-[87.5rem]:w-full" />
          ))}
        </nav>

        <div className="w-full shrink-0 border-hairline lg:w-[400px] lg:border-r min-[87.5rem]:w-[420px]">
          <div className="space-y-4 px-5 py-6">
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3.5 w-64 max-w-full" />
            </div>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[76px] w-full rounded-[var(--radius-card)]" />
            ))}
          </div>
        </div>

        <div className="hidden min-h-0 flex-1 flex-col bg-card-inset lg:flex">
          <div className="flex items-center justify-between border-b border-hairline bg-pure-snow px-4 py-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-7 w-24 rounded-full" />
          </div>
          <div className="flex-1 p-4 xl:p-6">
            <Skeleton className="h-full w-full rounded-[var(--radius-inner)]" />
          </div>
        </div>
      </div>
    </div>
  );
}
