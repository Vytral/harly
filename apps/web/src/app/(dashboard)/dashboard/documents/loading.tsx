import { PageHeaderSkeleton, SkeletonRegion, StatTileSkeleton } from "@/components/skeletons";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DOCUMENT_LIST_GRID } from "@/features/documents/shared";

const ROWS = [0, 1, 2, 3, 4];

export default function DocumentsLoading() {
  return (
    <SkeletonRegion className="mx-auto max-w-[1400px] space-y-6">
      {/* Files / Templates switch */}
      <div className="flex w-fit items-center gap-1">
        <Skeleton className="h-10 w-20 rounded-full" />
        <Skeleton className="h-10 w-40 rounded-full" />
      </div>

      <PageHeaderSkeleton hasEyebrow={false} actionCount={3} />

      <Card className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <StatTileSkeleton key={i} />
        ))}
      </Card>

      <div className="space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row">
          <Skeleton className="h-9 w-full flex-1 rounded-full" />
          <Skeleton className="h-9 w-32 rounded-full" />
          <Skeleton className="h-9 w-32 rounded-full" />
          <Skeleton className="h-9 w-28 rounded-full" />
          <Skeleton className="h-9 w-36 rounded-full" />
          <Skeleton className="h-9 w-40 rounded-full" />
          <Skeleton className="h-10 w-[4.5rem] rounded-full" />
        </div>
        <Skeleton className="h-3 w-28" />
      </div>

      <section className="overflow-hidden rounded-[var(--radius-card)] bg-card shadow-[var(--shadow-card)]">
        <div className={`hidden gap-4 border-b border-hairline px-4 py-3 md:grid ${DOCUMENT_LIST_GRID}`}>
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className="h-2.5 w-14" />
          <Skeleton className="h-2.5 w-12" />
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-2.5 w-14" />
          <Skeleton className="h-2.5 w-14" />
          <Skeleton className="h-2.5 w-14" />
        </div>
        <div className="divide-y divide-hairline">
          {ROWS.map((i) => (
            <div key={i} className={`grid grid-cols-1 gap-2 px-4 py-3 md:items-center md:gap-4 ${DOCUMENT_LIST_GRID}`}>
              <div className="hidden md:block">
                <Skeleton className="size-4 rounded-sm" />
              </div>
              <div className="flex min-w-0 items-center gap-3">
                <Skeleton className="size-9 shrink-0 rounded-[var(--radius-btn)]" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-56 max-w-full" />
                  <Skeleton className="h-3 w-40 max-w-full" />
                </div>
              </div>
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="hidden h-3 w-24 md:block" />
              <div className="hidden items-center gap-2 md:flex">
                <Skeleton className="size-5 rounded-full" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="hidden h-3 w-16 md:block" />
              <Skeleton className="hidden h-3 w-16 md:block" />
            </div>
          ))}
        </div>
      </section>
    </SkeletonRegion>
  );
}
