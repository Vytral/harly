import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function SecurityCardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-64" />
          </div>
          <Skeleton className="h-6 w-11 shrink-0 rounded-full" />
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </CardContent>
    </Card>
  );
}

export default function SecuritySettingsLoading() {
  return (
    <div className="space-y-6">
      <SecurityCardSkeleton rows={2} />
      <SecurityCardSkeleton rows={4} />
      <SecurityCardSkeleton rows={5} />
    </div>
  );
}
