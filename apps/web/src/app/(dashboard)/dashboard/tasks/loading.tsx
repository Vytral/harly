import { Skeleton } from "@/components/ui/skeleton";

/** Rows per urgency group. The real list shows grouped sections inside one white card. */
const GROUPS = [3, 2];

export default function TasksLoading() {
  return (
    <div className="space-y-5" aria-busy="true">
      <span className="sr-only">Loading…</span>

      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-full rounded-full sm:w-60" />
        <Skeleton className="h-9 w-24 rounded-full" />
        <Skeleton className="h-9 w-28 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-full" />
        <Skeleton className="h-9 w-32 rounded-full" />
        <div className="flex items-center gap-1.5 sm:ml-auto">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-[60px] rounded-full" />
          <Skeleton className="h-9 w-28 rounded-[var(--radius-btn)]" />
        </div>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-card)] bg-pure-snow py-2 shadow-[var(--shadow-card)]">
        {GROUPS.map((rowCount, gi) => (
          <section key={gi} className={gi > 0 ? "border-t border-hairline" : undefined}>
            <div className="flex items-center gap-2 px-4 py-3">
              <Skeleton className="size-3.5 rounded-sm" />
              <Skeleton className="size-2 rounded-full" />
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-5 w-6 rounded-full" />
            </div>
            <div className="divide-y divide-hairline border-t border-hairline">
              {Array.from({ length: rowCount }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="size-5 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-56 max-w-full" />
                    <div className="flex gap-1.5">
                      <Skeleton className="h-5 w-24 rounded-full" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Skeleton className="hidden h-3 w-14 sm:block" />
                    <Skeleton className="hidden h-3 w-20 sm:block" />
                    <Skeleton className="size-6 rounded-full" />
                    <Skeleton className="size-7 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
