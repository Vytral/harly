import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DevelopersSettingsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <Skeleton className="size-11 rounded-2xl" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
            <Skeleton className="h-8 w-28 rounded-lg" />
          </div>
          <Skeleton className="h-24 w-full rounded-xl" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <Skeleton className="size-11 rounded-2xl" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-52" />
              </div>
            </div>
            <Skeleton className="h-8 w-28 rounded-lg" />
          </div>
          <Skeleton className="h-32 w-full rounded-xl" />
        </CardContent>
      </Card>
    </div>
  );
}
