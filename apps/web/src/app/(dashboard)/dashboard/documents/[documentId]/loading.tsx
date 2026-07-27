import { Skeleton } from "@/components/ui/skeleton";

export default function DocumentDetailLoading() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <Skeleton className="h-8 w-40 rounded-md" />
      <div className="space-y-2">
        <Skeleton className="h-6 w-72" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-[600px] w-full rounded-xl" />
    </div>
  );
}
