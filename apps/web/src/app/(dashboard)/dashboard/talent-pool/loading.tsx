import { TableSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function TalentPoolLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-full max-w-sm rounded-lg" />
        <Skeleton className="h-10 w-28 rounded-full" />
        <Skeleton className="ml-auto hidden h-4 w-24 sm:block" />
      </div>
      <TableSkeleton rows={6} columns={7} showHeader />
    </div>
  );
}
