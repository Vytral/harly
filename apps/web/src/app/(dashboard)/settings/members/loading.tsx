import { CardListSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function MembersSettingsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
      <CardListSkeleton count={6} />
    </div>
  );
}
