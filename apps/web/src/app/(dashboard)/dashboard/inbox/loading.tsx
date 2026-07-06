import { Skeleton } from "@/components/ui/skeleton";

export default function InboxLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-1 rounded-lg border bg-card p-1">
            <Skeleton className="h-8 w-16 rounded-md" />
            <Skeleton className="h-8 w-20 rounded-md" />
          </div>
          <Skeleton className="h-8 w-36 rounded-lg" />
        </div>

        <div className="overflow-hidden rounded-xl border bg-card">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-start gap-3 px-4 py-3.5"
            >
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3.5 w-full max-w-[16rem]" />
                <Skeleton className="h-3 w-full max-w-[24rem]" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="size-8 shrink-0 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
