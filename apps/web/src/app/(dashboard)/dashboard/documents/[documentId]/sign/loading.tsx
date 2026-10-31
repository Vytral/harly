import { Skeleton } from "@/components/ui/skeleton";

export default function NativeSignLoading() {
  return (
    <div
      className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[1600px] flex-col px-4 py-4 sm:px-6 lg:px-8"
      aria-busy="true"
    >
      <span className="sr-only">Loading…</span>

      <header className="flex items-center gap-3 border-b border-hairline pb-3">
        <Skeleton className="-ml-2 h-8 w-16 shrink-0 rounded-[var(--radius-btn)]" />
        <span className="hidden h-5 w-px bg-hairline sm:block" aria-hidden />
        <div className="flex min-w-0 items-center gap-2">
          <Skeleton className="size-4 shrink-0 rounded-full" />
          <Skeleton className="h-4 w-28 shrink-0" />
          <Skeleton className="h-3.5 w-48 max-w-[40vw]" />
        </div>
        <Skeleton className="ml-auto h-6 w-24 shrink-0 rounded-full" />
      </header>

      <div className="grid min-h-0 flex-1 gap-5 py-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex min-h-[520px] flex-col overflow-hidden rounded-[var(--radius-card)] bg-card-inset shadow-[var(--shadow-card)]">
          <div className="min-h-0 flex-1 p-3 sm:p-4">
            <Skeleton className="mx-auto aspect-[1/1.3] w-full max-w-[640px] rounded-[var(--radius-inner)]" />
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-hairline bg-pure-snow px-3 py-2.5">
            <Skeleton className="h-3 w-64 max-w-full" />
            <Skeleton className="h-8 w-32 shrink-0 rounded-[var(--radius-btn)]" />
          </div>
        </section>

        <aside className="flex h-fit flex-col gap-5 rounded-[var(--radius-card)] bg-pure-snow p-5 shadow-[var(--shadow-card)] lg:sticky lg:top-5">
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-full" />
          </div>
          <Skeleton className="h-32 w-full rounded-[var(--radius-inner)]" />
          <div className="flex items-start gap-3 rounded-[var(--radius-inner)] bg-card-inset p-3">
            <Skeleton className="mt-0.5 size-4 shrink-0 rounded-sm" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-44" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
          <Skeleton className="h-14 w-full rounded-[var(--radius-inner)]" />
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-28" />
            <div className="flex flex-wrap gap-1.5">
              <Skeleton className="h-6 w-16 rounded-md" />
              <Skeleton className="h-6 w-16 rounded-md" />
            </div>
          </div>
          <Skeleton className="h-9 w-full rounded-[var(--radius-btn)]" />
        </aside>
      </div>
    </div>
  );
}
