import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors settings/members/page.tsx → MembersAndRoles: the Members/Roles tab
 * list, the search + role filter + invite toolbar, and the members card with
 * its count header and avatar/name/role rows.
 */
export default function MembersSettingsLoading() {
  return (
    <div aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading…</span>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex h-11 items-center gap-1 rounded-[var(--radius-btn)] bg-card-inset p-1">
          <Skeleton className="h-9 w-28 rounded-[var(--radius-sm)]" />
          <Skeleton className="h-9 w-24 rounded-[var(--radius-sm)]" />
        </div>
      </div>

      <div className="space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-full max-w-sm flex-1 rounded-[var(--radius-btn)]" />
            <Skeleton className="hidden h-4 w-24 shrink-0 md:block" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-44 rounded-[var(--radius-btn)]" />
            <Skeleton className="h-9 w-24 rounded-[var(--radius-btn)]" />
          </div>
        </div>

        <Card className="gap-0 overflow-hidden py-0">
          <div className="flex items-center justify-between border-b border-hairline bg-card-inset px-5 py-2.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="hidden h-3 w-10 sm:block" />
          </div>
          <ul className="divide-y divide-hairline">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-36 max-w-full" />
                  <Skeleton className="h-3 w-52 max-w-full" />
                </div>
                <Skeleton className="h-9 w-36 shrink-0 rounded-[var(--radius-btn)]" />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
