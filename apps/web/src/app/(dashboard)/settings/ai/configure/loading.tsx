import { Skeleton } from "@/components/ui/skeleton";
import { FormSkeleton } from "@/components/skeletons";

export default function ConfigureAiSettingsLoading() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-8 w-32 rounded-md" />
      <FormSkeleton fields={4} />
    </div>
  );
}
