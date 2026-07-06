import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function PortalDashboardLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <Skeleton className="h-44 w-full rounded-2xl sm:h-52" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-4 p-4">
              <Skeleton className="h-4 w-32" />
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="size-5 shrink-0 rounded-full" />
                  <Skeleton className="h-4 w-full max-w-[12rem]" />
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Skeleton className="h-4 w-36" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="flex items-center gap-3 p-3">
                  <Skeleton className="size-9 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <Skeleton className="h-12 w-full rounded-xl" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-48" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
