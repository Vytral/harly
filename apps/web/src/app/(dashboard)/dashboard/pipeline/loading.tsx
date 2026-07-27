import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/skeletons";

/** Matches the default `?view=list` , the board only shows on the explicit toggle. */
export default function PipelineLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-20 rounded-lg" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 w-full max-w-sm rounded-lg" />
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
      <TableSkeleton rows={8} columns={4} />
    </div>
  );
}
