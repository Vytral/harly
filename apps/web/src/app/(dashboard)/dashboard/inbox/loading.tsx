import { Skeleton } from "@/components/ui/skeleton";

export default function InboxLoading() {
  return (
    <div
      aria-busy="true"
      className="flex h-[calc(100dvh-15rem)] min-h-[34rem] min-w-0 flex-col overflow-hidden rounded-[var(--radius-card)] bg-card shadow-[var(--shadow-card)]"
    >
      <div className="flex min-h-14 items-center gap-3 border-b border-hairline px-4 py-2.5">
        <Skeleton className="h-9 w-full rounded-full lg:w-[328px]" />
        <Skeleton className="ml-auto hidden h-8 w-16 rounded-full sm:block" />
        <Skeleton className="hidden h-8 w-20 rounded-full sm:block" />
        <Skeleton className="size-8 rounded-full" />
      </div>
      <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[280px_minmax(0,1fr)_300px]">
        <div className="border-r border-hairline">
          <div className="border-b border-hairline px-4 py-2.5">
            <Skeleton className="h-3 w-16" />
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-2.5 w-full max-w-[12rem]" />
              </div>
            </div>
          ))}
        </div>
        <div className="hidden lg:block">
          <div className="border-b border-hairline px-5 py-3.5">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="mt-2 h-3 w-28" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2 px-5 py-3.5">
              <Skeleton className="h-3 w-48" />
              <Skeleton className="h-2.5 w-full max-w-[22rem]" />
            </div>
          ))}
        </div>
        <div className="hidden border-l border-hairline bg-card-inset/50 p-4 lg:block">
          <Skeleton className="h-24 w-full rounded-[var(--radius-inner)]" />
        </div>
      </div>
    </div>
  );
}
