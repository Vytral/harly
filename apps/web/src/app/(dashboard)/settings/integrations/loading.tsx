import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function IntegrationCardSkeleton() {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-5">
        <Skeleton className="size-11 shrink-0 rounded-2xl" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16 rounded-full" />
          </div>
          <Skeleton className="h-3 w-full max-w-md" />
          <Skeleton className="h-3 w-48" />
        </div>
        <Skeleton className="hidden h-8 w-28 shrink-0 rounded-lg sm:block" />
      </CardContent>
    </Card>
  );
}

export default function IntegrationsSettingsLoading() {
  return (
    <div className="space-y-4">
      <IntegrationCardSkeleton />
      <IntegrationCardSkeleton />
      <IntegrationCardSkeleton />
      <IntegrationCardSkeleton />
      <div className="space-y-3">
        <Skeleton className="h-3 w-36" />
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <IntegrationCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
