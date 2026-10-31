import { Skeleton } from "@/components/ui/skeleton";

const SOFT_CARD = "rounded-[var(--radius-card)] bg-pure-snow p-5 shadow-[var(--shadow-card)]";
const META = ["w-24", "w-28", "w-20", "w-16", "w-24", "w-28"];

export default function DocumentDetailLoading() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-5" aria-busy="true">
      <span className="sr-only">Loading…</span>

      {/* Back to documents */}
      <div className="-ml-2 w-fit">
        <Skeleton className="h-8 w-40 rounded-[var(--radius-btn)]" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <div className={SOFT_CARD}>
            <div className="flex items-start gap-3">
              <Skeleton className="size-12 shrink-0 rounded-[var(--radius-btn)]" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-6 w-72 max-w-full" />
                <Skeleton className="h-3 w-64 max-w-full" />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-hairline pt-4 sm:grid-cols-3">
              {META.map((width, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className={`h-4 ${width}`} />
                </div>
              ))}
            </div>
          </div>

          <div className={SOFT_CARD}>
            <div className="mb-3 flex items-center justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-32 rounded-[var(--radius-btn)]" />
            </div>
            <Skeleton className="h-40 w-full rounded-[var(--radius-inner)]" />
          </div>

          <div className={SOFT_CARD}>
            <Skeleton className="mb-3 h-4 w-32" />
            <div className="divide-y divide-hairline">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-1.5 py-2.5 first:pt-0 last:pb-0">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-44" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="space-y-5">
          <div className={`space-y-2 ${SOFT_CARD}`}>
            <Skeleton className="h-3 w-16" />
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-8 rounded-[var(--radius-btn)]" />
              <Skeleton className="h-8 rounded-[var(--radius-btn)]" />
              <Skeleton className="h-8 rounded-[var(--radius-btn)]" />
              <Skeleton className="h-8 rounded-[var(--radius-btn)]" />
            </div>
          </div>

          <div className={`space-y-2 ${SOFT_CARD}`}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-9 w-full rounded-[var(--radius-btn)]" />
          </div>

          <div className={`space-y-3 ${SOFT_CARD}`}>
            <Skeleton className="h-3 w-24" />
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-9 w-full rounded-[var(--radius-btn)]" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-9 w-full rounded-[var(--radius-btn)]" />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
