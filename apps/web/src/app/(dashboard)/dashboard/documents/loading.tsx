import { PageHeaderSkeleton, TableSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function DocumentsLoading() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-6" aria-busy="true" aria-label="Loading documents">
      <PageHeaderSkeleton actionCount={1} />
      <div className="flex gap-8 border-b pb-5">
        <Skeleton className="h-10 w-28 rounded-md" />
        <Skeleton className="h-10 w-28 rounded-md" />
        <Skeleton className="h-10 w-28 rounded-md" />
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
      <TableSkeleton rows={5} columns={5} showHeader />
    </div>
  );
}
