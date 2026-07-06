import { PageHeaderSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function TasksLoading() {
  return (
    <div className="space-y-5">
      <PageHeaderSkeleton actionCount={3} />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Skeleton className="h-10 w-full rounded-lg sm:w-60" />
        <Skeleton className="h-10 w-full rounded-lg sm:w-44" />
        <Skeleton className="h-10 w-full rounded-lg sm:w-36" />
        <div className="flex items-center gap-2 sm:ml-auto">
          <Skeleton className="h-9 w-20 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
      </div>

      <div className="space-y-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3"
          >
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
