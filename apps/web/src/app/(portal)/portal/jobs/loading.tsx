import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function PortalJobsLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4 sm:p-6">
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>

      {Array.from({ length: 3 }).map((_, groupIndex) => (
        <div key={groupIndex} className="space-y-3">
          <div className="mb-3 flex items-center gap-3">
            <Skeleton className="h-3 w-24" />
            <div className="h-px flex-1 bg-border" />
            <Skeleton className="h-3 w-6" />
          </div>
          <div className="space-y-2.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="flex items-start justify-between gap-4 p-4 sm:p-5">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                  <Skeleton className="h-6 w-20 shrink-0 rounded-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
