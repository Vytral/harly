import { Skeleton } from "@/components/ui/skeleton";

export default function InboxLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex gap-1 border-b border-border/80 p-2">
          <Skeleton className="h-7 w-12 rounded-full" />
          <Skeleton className="h-7 w-20 rounded-full" />
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-7 w-16 rounded-full" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 border-b border-border/60 px-3 py-3">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-10" />
              </div>
              <Skeleton className="h-3.5 w-full max-w-[16rem]" />
              <Skeleton className="h-3 w-full max-w-[20rem]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
