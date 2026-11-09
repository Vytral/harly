import { getTranslations } from "next-intl/server";

import { Skeleton } from "@/components/ui/skeleton";

/** Stat tiles; the last one has no delta badge, like the real offer-acceptance tile. */
const STAT_HAS_DELTA = [true, true, true, false];
const FUNNEL_WIDTHS = ["w-[92%]", "w-[74%]", "w-[58%]", "w-[36%]", "w-[18%]"];
const SOURCE_WIDTHS = ["w-[88%]", "w-[61%]", "w-[42%]", "w-[24%]"];

function CardHead({ titleClass }: { titleClass: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Skeleton className="size-8 shrink-0 rounded-[var(--radius-btn)]" />
      <Skeleton className={`h-4 ${titleClass}`} />
      <Skeleton className="size-6 rounded-full" />
    </div>
  );
}

const SOFT_CARD =
  "flex min-w-0 flex-col gap-5 rounded-[var(--radius-card)] bg-pure-snow p-5 shadow-[var(--shadow-card)]";

export default async function ReportsLoading() {
  const t = await getTranslations("pages.dashboardReports.loading");

  return (
    <div className="space-y-5" aria-busy="true">
      <span className="sr-only">{t("label")}</span>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-3.5 w-72 max-w-full" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-32 rounded-full" />
          <Skeleton className="h-9 w-32 rounded-[var(--radius-btn)]" />
        </div>
      </div>

      <div className="flex items-center gap-2.5 rounded-[var(--radius-card)] bg-pure-snow px-5 py-3.5 shadow-[var(--shadow-card)]">
        <Skeleton className="size-4 shrink-0 rounded-full" />
        <Skeleton className="h-3.5 w-96 max-w-full" />
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-[var(--radius-card)] bg-pure-snow p-4 shadow-[var(--shadow-card)] sm:grid-cols-2 xl:grid-cols-4">
        {STAT_HAS_DELTA.map((hasDelta, i) => (
          <div key={i} className="rounded-[var(--radius-inner)] bg-card-inset p-4">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="size-8 rounded-[var(--radius-btn)]" />
              {hasDelta ? <Skeleton className="h-5 w-12 rounded-full" /> : null}
            </div>
            <Skeleton className="mt-4 h-3 w-24" />
            <Skeleton className="mt-2 h-7 w-20" />
            <Skeleton className="mt-2 h-3 w-36 max-w-full" />
          </div>
        ))}
      </div>

      <div className={SOFT_CARD}>
        <CardHead titleClass="w-28" />
        <Skeleton className="h-60 w-full rounded-[var(--radius-inner)]" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className={SOFT_CARD}>
          <CardHead titleClass="w-20" />
          <div className="space-y-3">
            {FUNNEL_WIDTHS.map((width, i) => (
              <div key={i} className="grid grid-cols-[minmax(90px,120px)_1fr_auto] items-center gap-3 sm:gap-4">
                <Skeleton className="h-3.5 w-20" />
                <div className="flex h-7 rounded-lg bg-card-inset">
                  <Skeleton className={`h-full rounded-lg ${width}`} />
                </div>
                <Skeleton className="h-3.5 w-20" />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-hairline pt-2">
            <Skeleton className="h-3 w-64 max-w-full" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>

        <div className={SOFT_CARD}>
          <CardHead titleClass="w-28" />
          <div className="space-y-4">
            <Skeleton className="h-44 w-full rounded-[var(--radius-inner)]" />
            <Skeleton className="h-3 w-80 max-w-full" />
          </div>
        </div>
      </div>

      <div className={SOFT_CARD}>
        <CardHead titleClass="w-36" />
        <div className="space-y-3">
          {SOURCE_WIDTHS.map((width, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,8rem)_1fr_4rem] items-center gap-3">
              <Skeleton className="h-3.5 w-24" />
              <div className="flex h-5 rounded-lg bg-card-inset">
                <Skeleton className={`h-full rounded-lg ${width}`} />
              </div>
              <Skeleton className="ml-auto h-3.5 w-12" />
            </div>
          ))}
        </div>
      </div>

      <div className="px-1">
        <Skeleton className="h-3 w-[32rem] max-w-full" />
      </div>
    </div>
  );
}
