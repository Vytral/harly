import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoRowsSkeleton, SkeletonRegion } from "@/components/skeletons";
import { cn } from "@/lib/utils";

/**
 * Mirrors candidates/[candidateId]/page.tsx: back link + pager, the header card
 * (identity and actions, then the decision bar), and the 1.6fr / 1fr grid with
 * the profile tabs and content on the left and Details + Activity on the right.
 */
export default function CandidateDetailLoading() {
  return (
    <SkeletonRegion className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="-ml-2 h-8 w-40 rounded-[var(--radius-btn)]" />
        <div className="flex items-center gap-1">
          <Skeleton className="size-8 rounded-[var(--radius-btn)]" />
          <Skeleton className="h-4 w-14" />
          <Skeleton className="size-8 rounded-[var(--radius-btn)]" />
        </div>
      </div>

      <div className="min-w-0 space-y-5">
        <div className="rounded-[var(--radius-card)] bg-card p-5 shadow-[var(--shadow-card)] sm:p-6">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-start gap-4">
                <Skeleton className="size-[52px] shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex h-8 items-center gap-2.5">
                    <Skeleton className="h-6 w-52" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <div className="flex h-6 items-center">
                    <Skeleton className="h-3.5 w-72 max-w-full" />
                  </div>
                  <div className="flex h-8 items-center gap-1">
                    <Skeleton className="size-8 rounded-[var(--radius-btn)]" />
                    <Skeleton className="size-8 rounded-[var(--radius-btn)]" />
                    <Skeleton className="size-8 rounded-[var(--radius-btn)]" />
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Skeleton className="h-9 w-20 rounded-[var(--radius-btn)]" />
                <Skeleton className="hidden h-9 w-24 rounded-[var(--radius-btn)] sm:block" />
                <Skeleton className="size-8 rounded-[var(--radius-btn)]" />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-inner)] bg-card-inset px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-3 max-sm:w-full">
                <Skeleton className="h-8 w-40 rounded-full" />
                <Skeleton className="hidden h-7 w-64 rounded-full md:block" />
              </div>
              <div className="ml-auto flex items-center gap-2 max-sm:w-full">
                <Skeleton className="h-9 w-24 rounded-[var(--radius-btn)]" />
                <Skeleton className="h-9 w-44 rounded-[var(--radius-btn)] max-sm:flex-1" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-5">
            <div className="flex items-end gap-5 overflow-hidden border-b border-hairline">
              {["w-14", "w-20", "w-24", "w-24", "w-16", "w-16"].map((width, i) => (
                <div key={i} className="flex h-9 items-end pb-2.5">
                  <Skeleton className={cn("h-3.5", width)} />
                </div>
              ))}
            </div>
            <Card>
              <CardContent className="space-y-5 p-5">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-11/12" />
                  <Skeleton className="h-3.5 w-3/4" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-2/3" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="min-w-0 space-y-5">
            <Card className="gap-0 py-0">
              <div className="flex h-[54px] items-center px-5">
                <Skeleton className="h-4 w-16" />
              </div>
              <div className="border-t border-hairline p-3">
                <InfoRowsSkeleton rows={6} />
              </div>
            </Card>

            <div className="rounded-[var(--radius-card)] bg-card shadow-[var(--shadow-card)]">
              <div className="flex items-center gap-2 px-5 py-4">
                <Skeleton className="size-4 rounded" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-6 rounded-full" />
              </div>
              <div className="border-t border-hairline px-4 py-3">
                <ol>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <li key={i} className="flex gap-3 py-2">
                      <Skeleton className="size-7 shrink-0 rounded-full" />
                      <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
                        <Skeleton className="h-3.5 w-full" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SkeletonRegion>
  );
}
