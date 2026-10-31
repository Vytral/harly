import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardJobsLoading() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-28 rounded-[var(--radius-btn)]" />
      </div>

      <Card className="p-3">
        <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-[var(--radius-inner)] bg-card-inset px-4 py-3.5">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="mt-3 h-7 w-12" />
              <Skeleton className="mt-2 h-3 w-24" />
            </div>
          ))}
        </section>
      </Card>

      <Card className="gap-0 py-0">
        <div className="flex flex-wrap items-center gap-2 px-5 py-4">
          <Skeleton className="h-9 w-64 rounded-full" />
          <Skeleton className="h-9 w-28 rounded-full" />
          <Skeleton className="h-9 w-32 rounded-full" />
        </div>
        <div className="divide-y divide-hairline border-t border-hairline">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <Skeleton className="size-9 rounded-[var(--radius-inner)]" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="ml-auto h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
