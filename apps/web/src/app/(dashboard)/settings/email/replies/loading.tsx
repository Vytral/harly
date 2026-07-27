import { Skeleton } from "@/components/ui/skeleton";
import { FormSkeleton } from "@/components/skeletons";

export default function ConfigureReplyHandlingLoading() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-8 w-40 rounded-md" />
      <FormSkeleton fields={3} />
    </div>
  );
}
