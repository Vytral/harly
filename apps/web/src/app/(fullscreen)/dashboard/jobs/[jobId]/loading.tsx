import { Skeleton } from "@/components/ui/skeleton";

export default function JobDetailLoading() {
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-paper">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border/70 px-3">
        <Skeleton className="h-4 w-40" />
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-28 rounded-full" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-48 shrink-0 flex-col gap-2 border-r border-border/70 p-4 md:flex">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full rounded-md" />
          ))}
        </div>
        <div className="flex w-full max-w-2xl shrink-0 flex-col gap-4 overflow-y-auto p-6">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
        <div className="hidden flex-1 bg-muted/30 p-6 lg:block">
          <Skeleton className="h-full w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
