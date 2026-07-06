import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AccountLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-8 w-40" />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardContent className="space-y-5 p-5">
            <div className="flex items-center gap-4">
              <Skeleton className="size-20 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-56" />
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Skeleton className="h-9 w-24 rounded-lg" />
              <Skeleton className="h-9 w-32 rounded-lg" />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-5">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-9 w-40 rounded-lg" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-3 p-5">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-9 w-36 rounded-lg" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
