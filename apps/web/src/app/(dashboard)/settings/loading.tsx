import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors settings/page.tsx: the company branding card, then the Gravatar
 * toggle card. Only the right column, settings/layout.tsx owns the nav and
 * the section title.
 */
export default function SettingsLoading() {
  return (
    <div aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading…</span>

      <Card className="gap-5 p-6">
        <div className="flex items-start gap-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-btn)] border border-hairline bg-pure-snow">
            <Skeleton className="size-5 rounded-sm" />
          </div>
          <div className="space-y-2 pt-0.5">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3.5 w-80 max-w-full" />
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-9 w-full rounded-[var(--radius-btn)]" />
            </div>
          ))}
        </div>

        <div className="-mx-6 -mb-6 flex items-center justify-end gap-2 border-t border-hairline px-5 py-3">
          <Skeleton className="h-9 w-24 rounded-[var(--radius-btn)]" />
          <Skeleton className="h-9 w-32 rounded-[var(--radius-btn)]" />
        </div>
      </Card>

      <Card className="gap-0 p-0">
        <div className="flex items-center justify-between gap-6 px-5 py-4">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-72 max-w-full" />
          </div>
          <Skeleton className="h-5 w-9 shrink-0 rounded-full" />
        </div>
      </Card>
    </div>
  );
}
