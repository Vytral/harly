import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function PortalSettingsLoading() {
  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-72 max-w-full" />
          </div>
          <Skeleton className="h-6 w-11 shrink-0 rounded-full" />
        </div>

        <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4">
          <Skeleton className="h-4 w-32" />
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-4 w-48" />
        </div>

        <div className="flex justify-end gap-2">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
      </CardContent>
    </Card>
  );
}
