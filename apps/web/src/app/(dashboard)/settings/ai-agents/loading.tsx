import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors settings/ai-agents/page.tsx: connect card, setup steps, connection rows. */
export default function AiAgentsSettingsLoading() {
  return (
    <div aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading…</span>
      <Card className="gap-5 p-6">
        <div className="flex items-start gap-4">
          <Skeleton className="size-10 rounded-[var(--radius-btn)]" />
          <div className="space-y-2 pt-0.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3.5 w-96 max-w-full" />
          </div>
        </div>
        <Skeleton className="h-11 w-full rounded-[var(--radius-btn)]" />
        <div className="flex gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-28 w-full rounded-2xl" />
      </Card>
      <Card className="gap-4 p-6">
        <Skeleton className="h-4 w-44" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3.5">
            <div className="space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-56 max-w-full" />
            </div>
            <Skeleton className="h-8 w-20 rounded-[var(--radius-btn)]" />
          </div>
        ))}
      </Card>
    </div>
  );
}
