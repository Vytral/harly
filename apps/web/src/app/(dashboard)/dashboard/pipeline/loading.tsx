import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Matches the default `?view=list` , the board only shows on the explicit toggle. */
export default function PipelineLoading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-10 w-64 rounded-full" />
        <Skeleton className="h-9 w-40 rounded-full" />
      </div>
      <Card className="gap-0 py-0">
        <div className="flex flex-wrap items-center gap-2 px-5 py-4">
          <Skeleton className="h-9 w-20 rounded-full" />
          <Skeleton className="h-9 w-28 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="ml-auto h-9 w-56 rounded-full" />
        </div>
        <div className="divide-y divide-hairline border-t border-hairline">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5">
              <Skeleton className="size-4 rounded-sm" />
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-4 w-44" />
              <Skeleton className="ml-auto h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
