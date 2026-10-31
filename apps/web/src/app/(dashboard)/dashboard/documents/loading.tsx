import { Skeleton } from "@/components/ui/skeleton";

const STATS = [0, 1, 2, 3, 4];
const ROWS = [0, 1, 2, 3, 4];
/** Same column template as the real list: checkbox, name, type, association, owner, updated. */
const LIST_GRID = "md:grid-cols-[2.5rem_minmax(15rem,2fr)_7rem_9rem_9rem_8rem]";

export default function DocumentsLoading() {
  return (
    <div className="relative mx-auto max-w-[1400px] space-y-6" aria-busy="true">
      <span className="sr-only">Loading…</span>

      {/* Files / Workflow templates tabs */}
      <div className="flex w-fit items-center gap-1">
        <Skeleton className="h-10 w-20 rounded-full" />
        <Skeleton className="h-10 w-40 rounded-full" />
      </div>

      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-3.5 w-96 max-w-full" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-28 rounded-[var(--radius-btn)]" />
          <Skeleton className="h-9 w-40 rounded-[var(--radius-btn)]" />
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 rounded-[var(--radius-card)] bg-pure-snow p-4 shadow-[var(--shadow-card)] sm:grid-cols-3 lg:grid-cols-5">
        {STATS.map((i) => (
          <div key={i} className="flex min-w-0 flex-col gap-1 rounded-[var(--radius-inner)] bg-card-inset px-4 py-3.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="mt-1 h-7 w-12" />
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex gap-1 border-b border-hairline">
          <div className="border-b-2 border-near-ink px-3 py-2">
            <Skeleton className="h-4 w-36" />
          </div>
          <div className="border-b-2 border-transparent px-3 py-2">
            <Skeleton className="h-4 w-20" />
          </div>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row">
          <Skeleton className="h-9 w-full flex-1 rounded-full" />
          <Skeleton className="h-9 w-32 rounded-full" />
          <Skeleton className="h-9 w-32 rounded-full" />
          <Skeleton className="h-9 w-36 rounded-full" />
          <div className="flex shrink-0 items-center gap-1">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="size-8 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-3 w-28" />
      </div>

      <section className="overflow-hidden rounded-[var(--radius-card)] bg-pure-snow shadow-[var(--shadow-card)]">
        <div className={`hidden gap-4 border-b border-hairline px-4 py-3 md:grid ${LIST_GRID}`}>
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className="h-2.5 w-14" />
          <Skeleton className="h-2.5 w-12" />
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-2.5 w-14" />
          <Skeleton className="h-2.5 w-14" />
        </div>
        <div className="divide-y divide-hairline">
          {ROWS.map((i) => (
            <div key={i} className={`grid grid-cols-1 gap-2 px-4 py-3 md:items-center md:gap-4 ${LIST_GRID}`}>
              <div className="hidden md:block">
                <Skeleton className="size-4 rounded-sm" />
              </div>
              <div className="flex min-w-0 items-center gap-3">
                <Skeleton className="size-9 shrink-0 rounded-[var(--radius-btn)]" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-56 max-w-full" />
                  <Skeleton className="h-3 w-72 max-w-full" />
                </div>
              </div>
              <Skeleton className="hidden h-3 w-16 md:block" />
              <Skeleton className="hidden h-3 w-24 md:block" />
              <div className="hidden items-center gap-2 md:flex">
                <Skeleton className="size-5 rounded-full" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="hidden h-3 w-16 md:block" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
