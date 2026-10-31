import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the workflow document templates manager that this route redirects to. */
const ROWS = [0, 1, 2, 3];

export default function DocumentTemplatesLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-5 py-8 sm:px-8 lg:px-10" aria-busy="true">
      <span className="sr-only">Loading…</span>

      <div className="flex w-fit items-center gap-1">
        <Skeleton className="h-10 w-20 rounded-full" />
        <Skeleton className="h-10 w-40 rounded-full" />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-72 max-w-full" />
          <Skeleton className="h-3.5 w-[36rem] max-w-full" />
          <Skeleton className="h-3.5 w-80 max-w-full" />
        </div>
        <Skeleton className="h-9 w-52 rounded-[var(--radius-btn)]" />
      </div>

      <div className="divide-y divide-hairline overflow-hidden rounded-[var(--radius-card)] bg-pure-snow shadow-[var(--shadow-card)]">
        {ROWS.map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-4">
            <Skeleton className="size-9 shrink-0 rounded-[var(--radius-btn)]" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-56 max-w-full" />
              <Skeleton className="h-3 w-full max-w-md" />
              <Skeleton className="h-3 w-24" />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Skeleton className="size-9 rounded-[var(--radius-btn)]" />
              <Skeleton className="size-9 rounded-[var(--radius-btn)]" />
              <Skeleton className="size-4 rounded-sm" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
