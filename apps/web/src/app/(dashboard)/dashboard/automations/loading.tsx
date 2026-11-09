import { getTranslations } from "next-intl/server";

import { Skeleton } from "@/components/ui/skeleton";

const ROWS = [0, 1, 2, 3];

export default async function AutomationsLoading() {
  const t = await getTranslations("pages.dashboardAutomations.loading");
  return (
    <div className="w-full" aria-busy="true">
      <span className="sr-only">{t("srLabel")}</span>

      {/* Workspace automation controls sit above the header, as in the page. */}
      <section className="mb-6 w-full rounded-[var(--radius-card)] bg-pure-snow p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-3.5 w-[28rem] max-w-full" />
            <Skeleton className="h-3.5 w-52" />
          </div>
          <Skeleton className="h-9 w-56 rounded-[var(--radius-btn)]" />
        </div>
        <div className="mt-4 max-w-2xl space-y-2">
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="h-[60px] w-full rounded-[var(--radius-btn)]" />
          <Skeleton className="h-3 w-64" />
        </div>
      </section>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-3.5 w-96 max-w-full" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-36 rounded-[var(--radius-btn)]" />
          <Skeleton className="h-9 w-28 rounded-[var(--radius-btn)]" />
        </div>
      </div>

      <div className="mt-6 divide-y divide-hairline overflow-hidden rounded-[var(--radius-card)] bg-pure-snow py-0 shadow-[var(--shadow-card)]">
        {ROWS.map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-4">
            <Skeleton className="size-9 shrink-0 rounded-[var(--radius-btn)]" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-3.5 w-full max-w-md" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <Skeleton className="h-[18px] w-8 shrink-0 rounded-full" />
            <Skeleton className="size-4 shrink-0 rounded-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}
