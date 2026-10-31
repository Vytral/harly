import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function ProviderRowSkeleton({ withPill = false }: { withPill?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border bg-card px-4 py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-lg border bg-muted/50">
          <Skeleton className="size-4 rounded-sm" />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-48 max-w-full" />
        </div>
      </div>
      {withPill ? (
        <Skeleton className="h-5 w-20 shrink-0 rounded-full" />
      ) : (
        <Skeleton className="h-8 w-24 shrink-0 rounded-[var(--radius-btn)]" />
      )}
    </div>
  );
}

/**
 * Mirrors settings/portal/page.tsx → CandidatePortalCard: the main card (header
 * with the enable switch, the portal URL line, and the three-cell feature
 * strip), the sign-in methods list, and the "Show on portal" switch rows.
 */
export default function PortalSettingsLoading() {
  return (
    <div aria-busy="true" className="space-y-5">
      <span className="sr-only">Loading…</span>

      <Card className="gap-0 overflow-hidden p-0">
        <div className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-btn)] border border-hairline bg-pure-snow">
                <Skeleton className="size-5 rounded-sm" />
              </div>
              <div className="space-y-2 pt-0.5">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-3.5 w-[28rem] max-w-full" />
              </div>
            </div>
            <div className="flex h-9 shrink-0 items-center gap-2 rounded-[var(--radius-btn)] border border-mist-border bg-pure-snow px-3">
              <Skeleton className="h-5 w-9 rounded-full" />
              <Skeleton className="h-3.5 w-6" />
            </div>
          </div>
          <div className="mt-4 rounded-xl border bg-muted/30 px-4 py-3">
            <Skeleton className="h-3.5 w-72 max-w-full" />
          </div>
        </div>
        <div className="grid grid-cols-1 divide-y border-t border-hairline bg-card-inset sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2 px-6 py-3.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-36" />
            </div>
          ))}
        </div>
      </Card>

      <div>
        <Skeleton className="mb-3 h-4 w-32" />
        <div className="space-y-3">
          <ProviderRowSkeleton withPill />
          <ProviderRowSkeleton />
          <ProviderRowSkeleton />
          <ProviderRowSkeleton />
        </div>
      </div>

      <div>
        <Skeleton className="mb-3 h-4 w-40" />
        <Card className="gap-0 p-0">
          <div className="divide-y divide-hairline">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-6 px-5 py-4">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-44" />
                  <Skeleton className="h-3 w-72 max-w-full" />
                </div>
                <Skeleton className="h-5 w-9 shrink-0 rounded-full" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
