import { Skeleton } from "@/components/ui/skeleton";
import { CardListSkeleton } from "@/components/skeletons";

export default function PersonLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 border-b pb-6">
        <Skeleton className="size-16 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-28" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <CardListSkeleton count={2} avatar={false} lines={2} trailing="none" />
        <CardListSkeleton count={2} avatar={false} lines={2} trailing="none" />
      </div>
    </div>
  );
}
