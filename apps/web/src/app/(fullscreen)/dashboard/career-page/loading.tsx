import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors career-page/page.tsx → CareerPageBuilder inside FocusModeShell: the
 * top bar (back pill, device toggle and template picker, save), the 76px icon
 * nav rail with six sections, the 440px editor column, and the device preview.
 */
export default function CareerPageLoading() {
  return (
    <div aria-busy="true" className="flex h-dvh w-full flex-col overflow-hidden bg-paper">
      <span className="sr-only">Loading…</span>

      <header className="relative z-40 flex h-12 shrink-0 items-center gap-3 border-b border-border/70 bg-paper-raised/70 px-3">
        <div className="flex min-w-0 flex-1 items-center">
          <Skeleton className="h-8 w-20 rounded-full" />
        </div>
        <div className="flex shrink-0 items-center justify-center gap-2">
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-8 w-40 rounded-lg" />
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-[76px] shrink-0 flex-col items-center gap-1.5 border-r border-border bg-paper py-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex w-14 flex-col items-center gap-1.5 rounded-2xl py-3">
              <Skeleton className="size-[22px] rounded-md" />
              <Skeleton className="h-2.5 w-10" />
            </div>
          ))}
        </nav>

        <div className="flex w-full max-w-[440px] shrink-0 flex-col overflow-hidden border-r border-border bg-paper-raised">
          <div className="space-y-6 px-6 py-6">
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3.5 w-64 max-w-full" />
            </div>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-20 rounded-xl" />
              <Skeleton className="h-20 rounded-xl" />
            </div>
          </div>
        </div>

        <div className="hidden min-h-0 flex-1 flex-col bg-kraft/40 lg:flex">
          <div className="flex items-center justify-between border-b border-border bg-paper-raised px-4 py-2.5">
            <div className="flex items-center gap-1.5">
              <Skeleton className="size-2.5 rounded-full" />
              <Skeleton className="size-2.5 rounded-full" />
              <Skeleton className="size-2.5 rounded-full" />
            </div>
            <Skeleton className="h-7 w-24 rounded-md" />
          </div>
          <div className="flex-1 overflow-hidden p-6">
            <Skeleton className="h-full w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
