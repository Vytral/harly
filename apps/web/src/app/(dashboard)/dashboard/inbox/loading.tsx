import { Skeleton } from "@/components/ui/skeleton";

export default function InboxLoading() {
  return (
    <div className="-mx-4 -mb-6 -mt-2 flex h-[calc(100%+2rem)] min-h-0 flex-col overflow-hidden border-t border-border/70 md:-mx-6 lg:-mx-8 lg:-mb-8 lg:-mt-3 lg:h-[calc(100%+2.75rem)]">
      <div className="flex h-12 items-center gap-3 border-b border-border/70 pl-3 pr-4">
        <Skeleton className="h-9 w-full rounded-md lg:w-[328px]" />
        <Skeleton className="ml-auto hidden h-7 w-16 rounded-md sm:block" />
        <Skeleton className="hidden h-7 w-20 rounded-md sm:block" />
        <Skeleton className="h-7 w-9 rounded-md" />
      </div>
      <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_360px_minmax(0,1fr)]">
          <div className="border-r border-border/70 bg-card">
            <div className="border-b border-border/60 px-4 py-2">
              <Skeleton className="h-3 w-16" />
            </div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-start gap-2.5 border-b border-border/50 px-4 py-3">
                <Skeleton className="size-7 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-2.5 w-8" />
                  </div>
                  <Skeleton className="h-2.5 w-full max-w-[18rem]" />
                </div>
              </div>
            ))}
          </div>
          <div className="hidden bg-background lg:block">
            <div className="border-b border-border/70 px-5 py-3.5">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="mt-2 h-3 w-28" />
            </div>
            <div>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-2 border-b border-border/50 px-5 py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-3 w-48" />
                    <Skeleton className="h-2.5 w-8" />
                  </div>
                  <Skeleton className="h-2.5 w-full max-w-[22rem]" />
                </div>
              ))}
            </div>
          </div>
          <div className="hidden bg-background lg:block">
            <div className="border-b border-border/70 px-5 py-3.5">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="mt-2 h-3 w-40" />
            </div>
            <div className="space-y-4 p-5">
              <Skeleton className="h-3 w-48" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        </div>
    </div>
  );
}
