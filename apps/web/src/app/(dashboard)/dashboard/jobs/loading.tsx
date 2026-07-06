import { CardListSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardJobsLoading() {
  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(28,27,22,0.04)]"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="size-8 rounded-lg" />
            </div>
            <Skeleton className="mt-4 h-7 w-16" />
            <Skeleton className="mt-1 h-3 w-24" />
          </div>
        ))}
      </section>

      <div className="flex items-center justify-between gap-3">
        <div className="flex w-fit items-center gap-1 rounded-lg border bg-card p-1">
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>

      <CardListSkeleton count={5} avatar={false} lines={2} trailing="badge" />
    </div>
  );
}
