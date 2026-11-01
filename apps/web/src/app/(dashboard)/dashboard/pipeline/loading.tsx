import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonRegion } from "@/components/skeletons";
import { cn } from "@/lib/utils";

/**
 * Mirrors pipeline/page.tsx in the default list view. The page title is drawn
 * by the dashboard shell (ShellPageHeading), so it is not repeated here.
 * Toolbar: job selector left, stage editor and view toggle right; then the
 * summary pills and the list card with stage tabs and rows.
 */
export default function PipelineLoading() {
  return (
    <SkeletonRegion className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-10 w-72 max-w-full rounded-full" />
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-32 rounded-[var(--radius-btn)]" />
          <Skeleton className="h-9 w-20 rounded-full" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-24 rounded-full bg-pure-snow shadow-[var(--shadow-card)]" />
        <Skeleton className="h-8 w-32 rounded-full bg-pure-snow shadow-[var(--shadow-card)]" />
        <Skeleton className="h-8 w-28 rounded-full bg-pure-snow shadow-[var(--shadow-card)]" />
      </div>

      <Card className="gap-0 py-0">
        <div className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
            {["w-16", "w-24", "w-20", "w-28", "w-20"].map((width, i) => (
              <Skeleton key={i} className={cn("h-9 shrink-0 rounded-full", width)} />
            ))}
          </div>
          <Skeleton className="h-9 w-full rounded-full sm:w-64" />
        </div>

        <div className="overflow-hidden rounded-b-[var(--radius-card)]">
          <div className="flex items-center gap-3 border-y border-hairline px-4 py-2.5 sm:px-5">
            <Skeleton className="size-4 rounded-sm" />
            <Skeleton className="h-3 w-56 max-w-full" />
            <Skeleton className="ml-auto hidden h-3 w-12 sm:block" />
          </div>
          <div className="divide-y divide-hairline">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:px-5"
              >
                <Skeleton className="size-4 rounded-sm" />
                <div className="flex min-w-0 items-center gap-3">
                  <Skeleton className="size-9 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-40 max-w-full" />
                    <Skeleton className="h-3 w-48 max-w-full" />
                  </div>
                </div>
                <div className="col-start-2 min-w-0 space-y-1.5 sm:col-auto">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-1.5 w-32 max-w-40" />
                </div>
                <div className="col-start-2 sm:col-auto sm:self-center">
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </SkeletonRegion>
  );
}
