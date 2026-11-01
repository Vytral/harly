import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors settings/integrations/[slug]/page.tsx: the ghost "Integrations" back
 * link, then the connect panel card (title + description, a field grid, a
 * switch row, and the footer actions).
 */
export default function IntegrationDetailLoading() {
  return (
    <div aria-busy="true" className="space-y-8">
      <span className="sr-only">Loading…</span>

      <div className="flex h-5 items-center gap-1.5">
        <Skeleton className="size-4 rounded-sm" />
        <Skeleton className="h-4 w-24" />
      </div>

      <Card className="p-6">
        <div className="mb-5 space-y-2">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-3.5 w-96 max-w-full" />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={i === 0 ? "space-y-2 sm:col-span-2" : "space-y-2"}>
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-9 w-full rounded-[var(--radius-btn)]" />
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-6 rounded-[var(--radius-inner)] border border-hairline px-5 py-4">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-72 max-w-full" />
          </div>
          <Skeleton className="h-5 w-9 shrink-0 rounded-full" />
        </div>

        <div className="mt-6 flex items-center justify-end gap-2 border-t border-hairline pt-5">
          <Skeleton className="h-9 w-24 rounded-[var(--radius-btn)]" />
          <Skeleton className="h-9 w-32 rounded-[var(--radius-btn)]" />
        </div>
      </Card>
    </div>
  );
}
