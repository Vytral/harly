import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function StatusCardSkeleton({ titleWidth, descWidth }: { titleWidth: string; descWidth: string }) {
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-btn)] border border-hairline bg-pure-snow">
              <Skeleton className="size-5 rounded-sm" />
            </div>
            <div className="space-y-2 pt-0.5">
              <div className="flex items-center gap-2">
                <Skeleton className={`h-4 ${titleWidth}`} />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className={`h-3.5 ${descWidth} max-w-full`} />
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Skeleton className="h-9 w-24 rounded-[var(--radius-btn)]" />
            <Skeleton className="h-9 w-20 rounded-[var(--radius-btn)]" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 divide-y border-t border-hairline bg-card-inset sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-2 px-6 py-3.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-40" />
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * Mirrors settings/email/page.tsx: the email delivery status card, the reply
 * handling status card, and the delivery log card below them.
 */
export default async function EmailSettingsLoading() {
  const t = await getTranslations("pages.settingsEmail.loading");
  return (
    <div aria-busy="true" className="space-y-6">
      <span className="sr-only">{t("loading")}</span>

      <StatusCardSkeleton titleWidth="w-32" descWidth="w-[30rem]" />
      <StatusCardSkeleton titleWidth="w-36" descWidth="w-[28rem]" />

      <Card className="flex flex-col gap-4 p-5">
        <div className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3.5 w-full max-w-xl" />
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-[var(--radius-btn)]" />
          ))}
        </div>
        <div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4 border-t border-hairline py-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-48 max-w-full" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
