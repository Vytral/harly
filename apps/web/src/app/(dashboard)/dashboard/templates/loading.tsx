import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the email templates manager: toolbar, info callout, then the template list card. */
const ROWS = [0, 1, 2, 3];

export default function TemplatesLoading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <span className="sr-only">Loading…</span>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-full rounded-full sm:w-64" />
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-32 rounded-[var(--radius-btn)]" />
          <Skeleton className="h-9 w-36 rounded-[var(--radius-btn)]" />
        </div>
      </div>

      <Skeleton className="h-14 w-full rounded-[var(--radius-inner)]" />

      <div className="divide-y divide-hairline overflow-hidden rounded-[var(--radius-card)] bg-pure-snow shadow-[var(--shadow-card)]">
        {ROWS.map((i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-4">
            <Skeleton className="mt-0.5 size-9 shrink-0 rounded-[var(--radius-btn)]" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-3 w-64 max-w-full" />
              <Skeleton className="h-3 w-full max-w-lg" />
              <Skeleton className="h-3 w-28" />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="size-8 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
