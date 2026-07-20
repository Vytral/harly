import { Skeleton } from "@/components/ui/skeleton";

export default function PortalDashboardLoading() {
  return (
    <div className="space-y-8">
      {/* Hero banner skeleton */}
      <Skeleton className="h-48 w-full rounded-3xl" />

      {/* Candidate heading skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-80" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>

      {/* Two-column skeleton */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Interview plan */}
        <div className="space-y-3">
          <Skeleton className="h-5 w-32" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
        {/* Interviews */}
        <div className="space-y-3">
          <Skeleton className="h-5 w-28" />
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4"
            >
              <Skeleton className="size-16 shrink-0 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-9 w-20 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
