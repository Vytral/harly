import { Skeleton } from "@/components/ui/skeleton";

function IntegrationRowSkeleton() {
  return (
    <div className="flex items-center gap-3 border-t border-border/60 py-3.5 sm:px-2">
      <Skeleton className="size-10 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-52 max-w-full" />
      </div>
      <Skeleton className="size-8 shrink-0 rounded-lg" />
    </div>
  );
}

function GroupSkeleton({ rows, titleWidth }: { rows: number; titleWidth: string }) {
  return (
    <section className="space-y-3">
      <Skeleton className={`h-4 ${titleWidth}`} />
      <div className="grid gap-x-10 sm:grid-cols-2">
        {Array.from({ length: rows }).map((_, i) => (
          <IntegrationRowSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}

/**
 * Mirrors settings/integrations/page.tsx: the section header with status pill,
 * the marketplace groups (label + two-column rows), then the "Data migration"
 * importers block.
 */
export default function IntegrationsSettingsLoading() {
  return (
    <div aria-busy="true" className="space-y-10">
      <span className="sr-only">Loading…</span>

      <div className="border-b border-border/70 pb-5">
        <div className="flex items-start gap-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-btn)] border border-hairline bg-pure-snow">
            <Skeleton className="size-5 rounded-sm" />
          </div>
          <div className="space-y-2 pt-0.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
            <Skeleton className="h-3.5 w-[30rem] max-w-full" />
          </div>
        </div>
      </div>

      <div className="space-y-8">
        <GroupSkeleton rows={4} titleWidth="w-24" />
        <GroupSkeleton rows={4} titleWidth="w-32" />
        <GroupSkeleton rows={4} titleWidth="w-28" />
        <GroupSkeleton rows={2} titleWidth="w-40" />
      </div>

      <section className="space-y-4 border-t border-border/70 pt-8">
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-3.5 w-96 max-w-full" />
        </div>
        <div className="grid gap-x-10 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <IntegrationRowSkeleton key={i} />
          ))}
        </div>
      </section>
    </div>
  );
}
