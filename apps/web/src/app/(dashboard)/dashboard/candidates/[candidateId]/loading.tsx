import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function CandidateDetailLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-9 w-40 rounded-lg" />
        <div className="flex items-center gap-1.5">
          <Skeleton className="size-8 rounded-md" />
          <Skeleton className="size-8 rounded-md" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Main column */}
        <div className="min-w-0 space-y-5">
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-start lg:justify-between">
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  <Skeleton className="size-20 shrink-0 rounded-full" />
                  <div className="min-w-0 space-y-2.5">
                    <Skeleton className="h-6 w-52" />
                    <Skeleton className="h-4 w-72 max-w-full" />
                    <div className="flex flex-wrap gap-2">
                      <Skeleton className="h-7 w-28 rounded-full" />
                      <Skeleton className="h-7 w-24 rounded-full" />
                    </div>
                    <Skeleton className="h-4 w-48" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Skeleton className="h-9 w-28 rounded-lg" />
                  <Skeleton className="h-9 w-24 rounded-lg" />
                  <Skeleton className="h-9 w-24 rounded-lg" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Skeleton className="h-9 w-72 rounded-lg" />

          <Card>
            <CardContent className="p-5">
              <Skeleton className="h-48 w-full rounded-xl" />
            </CardContent>
          </Card>
        </div>

        {/* Activity rail */}
        <div className="hidden xl:block">
          <Card>
            <CardContent className="space-y-4 p-4">
              <Skeleton className="h-4 w-24" />
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="size-2 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-full" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
