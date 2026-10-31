import { InfoRowsSkeleton, PageHeaderSkeleton, SkeletonRegion } from "@/components/skeletons";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DocumentDetailLoading() {
  return (
    <SkeletonRegion className="mx-auto max-w-[1400px] space-y-5">
      {/* Breadcrumb */}
      <Skeleton className="h-4 w-48" />

      <PageHeaderSkeleton hasEyebrow={false} actionCount={2} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_1fr]">
        <Card className="gap-4 lg:col-start-2 lg:row-start-1">
          <div className="flex items-center justify-between px-5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <div className="space-y-4 px-5">
            {[0, 1].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="size-7 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-44 max-w-full" />
                </div>
              </div>
            ))}
            <Skeleton className="h-8 w-40 rounded-[var(--radius-btn)]" />
          </div>
        </Card>

        <Card className="min-w-0 gap-4 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <div className="flex gap-5 border-b border-hairline px-5 pb-3">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="px-5">
            <Skeleton className="h-[60vh] w-full rounded-[var(--radius-inner)]" />
          </div>
        </Card>

        <div className="space-y-5 lg:col-start-2 lg:row-start-2">
          <Card className="gap-3">
            <div className="px-5">
              <Skeleton className="h-4 w-16" />
            </div>
            <div className="px-5">
              <InfoRowsSkeleton rows={4} />
            </div>
            <div className="space-y-4 border-t border-hairline px-5 pt-4">
              <Skeleton className="h-8 w-full rounded-[var(--radius-btn)]" />
              <Skeleton className="h-8 w-full rounded-[var(--radius-btn)]" />
            </div>
          </Card>
          <Card className="gap-3">
            <div className="px-5">
              <Skeleton className="h-4 w-16" />
            </div>
            <div className="space-y-4 px-5">
              <Skeleton className="h-8 w-full rounded-[var(--radius-btn)]" />
              <Skeleton className="h-8 w-full rounded-[var(--radius-btn)]" />
            </div>
          </Card>
        </div>
      </div>
    </SkeletonRegion>
  );
}
