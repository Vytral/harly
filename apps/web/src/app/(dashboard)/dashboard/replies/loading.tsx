import { Skeleton } from "@/components/ui/skeleton";

export default function RepliesLoading() {
  return (
    <div
      className="mx-auto max-w-4xl space-y-5"
      aria-busy="true"
      aria-label="Loading replies"
    >
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex gap-3 px-4 py-4 not-last:border-b">
            <Skeleton className="size-9 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-52 max-w-full" />
              <Skeleton className="h-4 w-80 max-w-full" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
