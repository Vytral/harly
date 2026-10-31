import { DirectoryCardSkeleton, KpiStripSkeleton, PageTitleRowSkeleton, SkeletonRegion } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors jobs/page.tsx: title + Create job, KPI card, tab pills, JobsTable card. */
export default function DashboardJobsLoading() {
  return (
    <SkeletonRegion className="space-y-5">
      <PageTitleRowSkeleton titleWidth="w-16" actionWidths={["w-32"]} />
      <KpiStripSkeleton count={4} />
      <div className="flex w-fit items-center gap-1.5">
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-8 w-20 rounded-full" />
      </div>
      <DirectoryCardSkeleton
        variant="human"
        countButton={false}
        identity="chip"
        chips={["w-24", "w-32", "w-20", "w-28", "w-24"]}
        columns={[
          { width: "w-24", hide: "md" },
          { width: "w-20", hide: "sm" },
          { width: "w-28" },
          { width: "w-20", pill: true, hide: "lg" },
        ]}
      />
    </SkeletonRegion>
  );
}
