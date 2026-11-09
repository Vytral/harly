import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getTranslations } from "next-intl/server";

/**
 * Mirrors jobs/[jobId]/page.tsx → JobForm inside FocusModeShell: the 56px top
 * bar, the 256px steps rail with its secondary actions, the stacked form
 * sections (heading + blurb + card), the sticky Back/Continue bar, and the
 * live preview on large screens.
 */
export default async function JobDetailLoading() {
  const t = await getTranslations("jobs.list");
  return (
    <div aria-busy="true" className="flex h-dvh w-full flex-col overflow-hidden bg-paper">
      <span className="sr-only">{t("loading")}</span>

      <header className="relative z-40 flex h-14 shrink-0 items-center gap-3 border-b border-hairline bg-pure-snow/80 px-3">
        <Skeleton className="h-8 w-20 rounded-full" />
        <div className="flex min-w-0 max-w-[40vw] flex-1 items-center justify-center gap-2">
          <Skeleton className="hidden h-3 w-20 md:block" />
          <Skeleton className="hidden h-4 w-44 md:block" />
          <Skeleton className="h-4 w-32 md:hidden" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-[var(--radius-btn)]" />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 flex-col gap-3 overflow-hidden p-4 md:flex">
          <nav className="rounded-[var(--radius-card)] bg-card p-4 shadow-[var(--shadow-card)]">
            <Skeleton className="mb-3 ml-2 h-4 w-16" />
            <ol className="flex flex-col gap-0.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className="flex items-center gap-3 rounded-[var(--radius-inner)] px-2 py-2">
                  <Skeleton className="size-6 shrink-0 rounded-full" />
                  <Skeleton className="h-3.5 w-28" />
                </li>
              ))}
            </ol>
          </nav>
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-8 w-full rounded-[var(--radius-btn)]" />
            <Skeleton className="h-8 w-full rounded-[var(--radius-btn)]" />
          </div>
        </aside>

        <div className="flex w-full min-w-0 max-w-2xl shrink-0 flex-col overflow-hidden">
          <div className="flex flex-col px-6 pb-8 pt-6">
            <div className="space-y-10">
              {[
                { title: "w-20", blurb: "w-96", fields: 4, cols: true },
                { title: "w-28", blurb: "w-80", fields: 1, tall: true },
                { title: "w-36", blurb: "w-72", fields: 3, cols: true },
                { title: "w-32", blurb: "w-88", fields: 3 },
                { title: "w-24", blurb: "w-64", fields: 2 },
                { title: "w-28", blurb: "w-80", fields: 2 },
              ].map((section, si) => (
                <section key={si} className="rounded-2xl">
                  <div className="mb-4 space-y-2 px-1">
                    <Skeleton className={`h-6 ${section.title}`} />
                    <Skeleton className={`h-3.5 ${section.blurb} max-w-full`} />
                  </div>
                  <Card className="p-5">
                    {section.tall ? (
                      <Skeleton className="h-64 w-full rounded-xl" />
                    ) : (
                      <div className={section.cols ? "grid gap-4 sm:grid-cols-2" : "grid gap-4"}>
                        {Array.from({ length: section.fields }).map((_, i) => (
                          <div key={i} className="space-y-2">
                            <Skeleton className="h-3.5 w-24" />
                            <Skeleton className="h-9 w-full rounded-[var(--radius-btn)]" />
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </section>
              ))}
            </div>
          </div>

          <div className="sticky bottom-0 z-10 mt-auto flex items-center justify-between gap-2 border-t border-hairline bg-pure-snow/90 px-6 py-3">
            <Skeleton className="h-9 w-20 rounded-[var(--radius-btn)]" />
            <Skeleton className="h-9 w-28 rounded-[var(--radius-btn)]" />
          </div>
        </div>

        <div className="hidden min-w-0 flex-1 p-5 lg:flex">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-card)] bg-card-inset shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between border-b border-hairline bg-card px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <Skeleton className="size-2.5 rounded-full" />
                <Skeleton className="size-2.5 rounded-full" />
                <Skeleton className="size-2.5 rounded-full" />
              </div>
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <div className="flex-1 p-6">
              <Skeleton className="h-full w-full rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
