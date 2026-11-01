import { Skeleton } from "@/components/ui/skeleton";

export default function PortalDashboardLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2 pt-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      <Skeleton className="h-24 w-full rounded-2xl" />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          <Skeleton className="h-5 w-40" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-2xl border border-hairline bg-card p-5">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-1.5 w-56 rounded-full" />
            </div>
          ))}
        </div>
        <div className="space-y-4">
          <Skeleton className="h-36 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
