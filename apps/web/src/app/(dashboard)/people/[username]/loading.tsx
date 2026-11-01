import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoCardSkeleton, SkeletonRegion } from "@/components/skeletons";

/**
 * Mirrors people/[username]/PersonProfile: back link, avatar + name header,
 * then the 360px sidebar (Contact, Specialties, Availability) beside the main
 * column (About, jobs), and the end-of-page marker.
 */
export default function PersonLoading() {
  return (
    <SkeletonRegion className="space-y-6">
      <div className="flex h-5 items-center">
        <Skeleton className="h-3.5 w-28" />
      </div>

      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <Skeleton className="size-16 shrink-0 rounded-full" />
        <div className="min-w-0 space-y-2">
          <div className="flex h-9 items-center">
            <Skeleton className="h-6 w-56 max-w-full" />
          </div>
          <div className="flex h-5 items-center">
            <Skeleton className="h-3.5 w-48" />
          </div>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
        <div className="space-y-4">
          <InfoCardSkeleton body="rows" count={3} titleWidth="w-20" />
          <InfoCardSkeleton body="rows" count={2} titleWidth="w-24" />
          <InfoCardSkeleton body="text" count={2} titleWidth="w-32" />
        </div>

        <div className="min-w-0 space-y-4">
          <InfoCardSkeleton body="text" count={3} titleWidth="w-14" />
          <Card className="gap-0 py-0">
            <div className="flex h-[54px] items-center px-5">
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="divide-y divide-hairline border-t border-hairline">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-4">
                  <Skeleton className="size-9 shrink-0 rounded-[var(--radius-inner)]" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-48 max-w-full" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="flex flex-col items-center gap-1.5 pb-6 pt-2">
        <div className="h-px w-10 bg-hairline" />
        <Skeleton className="h-3 w-36" />
      </div>
    </SkeletonRegion>
  );
}
