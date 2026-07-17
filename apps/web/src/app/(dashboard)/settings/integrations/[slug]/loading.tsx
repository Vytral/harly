import { Skeleton } from "@/components/ui/skeleton";

export default function IntegrationDetailLoading() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-5 w-28" />

      <div className="flex items-start gap-4 border-b border-border/70 pb-6">
        <Skeleton className="size-14 shrink-0 rounded-2xl" />
        <div className="min-w-0 flex-1 space-y-2 pt-0.5">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="h-4 w-2/3 max-w-sm" />
        </div>
      </div>

      <Skeleton className="h-48 w-full rounded-2xl" />
    </div>
  );
}
