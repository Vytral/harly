import { Skeleton } from "@/components/ui/skeleton";
import { getTranslations } from "next-intl/server";

const WEEKDAYS = Array.from({ length: 7 }, (_, i) => i);
/** Events per day in the mobile agenda (the real list groups by day). */
const AGENDA_DAYS = [2, 1, 3];
/** Six weeks, matching the month grid. */
const GRID_CELLS = Array.from({ length: 42 }, (_, i) => i);

export default async function CalendarsLoading() {
  const t = await getTranslations("pages.dashboardCalendars.loading");
  return (
    <div className="space-y-4" aria-busy="true">
      <span className="sr-only">{t("label")}</span>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-32 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>
        <div className="flex items-center gap-1">
          <Skeleton className="size-9 rounded-full" />
          <Skeleton className="h-9 w-36 rounded-full" />
          <Skeleton className="size-9 rounded-full" />
        </div>
      </header>

      <Skeleton className="h-3.5 w-56" />

      <div className="space-y-3 sm:hidden">
        {AGENDA_DAYS.map((count, d) => (
          <div key={d} className="space-y-1.5">
            <Skeleton className="h-3 w-24" />
            {Array.from({ length: count }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-[var(--radius-inner)] bg-pure-snow px-3 py-2.5 shadow-[var(--shadow-card)]"
              >
                <Skeleton className="h-3 w-14" />
                <Skeleton className="size-7 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-52 max-w-full" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-[var(--radius-card)] bg-pure-snow shadow-[var(--shadow-card)] sm:block">
        <div className="grid grid-cols-7 border-b border-hairline">
          {WEEKDAYS.map((i) => (
            <div key={i} className="flex justify-center px-2 py-3">
              <Skeleton className="h-2.5 w-8" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {GRID_CELLS.map((i) => (
            <div
              key={i}
              className="flex min-h-28 flex-col items-stretch gap-1 border-b border-r border-hairline p-1.5 last:border-r-0"
            >
              <Skeleton className="size-6 rounded-full" />
              <div className="flex flex-1 flex-col gap-1">
                {i % 4 === 1 || i % 7 === 3 ? <Skeleton className="h-4 w-full rounded-full" /> : null}
                {i % 6 === 2 ? <Skeleton className="h-4 w-4/5 rounded-full" /> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
