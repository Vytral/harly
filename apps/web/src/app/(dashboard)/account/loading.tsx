import { getTranslations } from "next-intl/server";

import { Skeleton } from "@/components/ui/skeleton";

const TABS = [0, 1, 2];
const PERSONAL_FIELDS = [0, 1, 2, 3];
const LINK_FIELDS = [0, 1];

export default async function AccountLoading() {
  const t = await getTranslations("pages.account.loading");
  return (
    <div className="mx-auto max-w-3xl space-y-8" aria-busy="true">
      <span className="sr-only">{t("srLabel")}</span>

      {/* Profile header: avatar, name and email, membership line */}
      <div className="flex flex-col items-center gap-4 pt-2 sm:flex-row sm:items-center sm:gap-6">
        <Skeleton className="size-16 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left">
          <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
          <Skeleton className="mx-auto h-3.5 w-56 sm:mx-0" />
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-1 sm:justify-start">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
      </div>

      {/* Profile / Security / Session tabs */}
      <div className="flex w-fit items-center gap-1">
        {TABS.map((i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-lg" />
        ))}
      </div>

      <div className="mt-6 space-y-6">
        <section className="overflow-hidden rounded-[var(--radius-card)] bg-pure-snow shadow-[var(--shadow-card)]">
          <div className="space-y-2 border-b border-hairline px-6 pb-3.5 pt-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3.5 w-72 max-w-full" />
          </div>
          <div className="space-y-5 px-6 py-5">
            <div className="grid gap-4 sm:grid-cols-2">
              {PERSONAL_FIELDS.slice(0, 2).map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-9 w-full rounded-[var(--radius-md)]" />
                </div>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {PERSONAL_FIELDS.slice(2).map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-9 w-full rounded-[var(--radius-md)]" />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[var(--radius-card)] bg-pure-snow shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between border-b border-hairline px-6 py-3.5">
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
            {LINK_FIELDS.map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-9 w-full rounded-[var(--radius-md)]" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
