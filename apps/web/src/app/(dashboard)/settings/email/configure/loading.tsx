import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors settings/email/configure/page.tsx → EmailSettingsForm: ghost back
 * link, then the page section with provider, from-address, SMTP host/port and
 * credential fields, the two switch rows, and the Save footer.
 */
export default function ConfigureEmailSettingsLoading() {
  return (
    <div aria-busy="true" className="space-y-5">
      <span className="sr-only">Loading…</span>

      <div className="-ml-3 flex h-8 w-fit items-center px-3">
        <Skeleton className="h-4 w-32" />
      </div>

      <section className="mx-auto w-full max-w-4xl space-y-6">
        <header className="space-y-2 border-b border-hairline pb-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3.5 w-96 max-w-full" />
        </header>

        <div className="max-w-3xl space-y-5">
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-9 w-full rounded-[var(--radius-btn)]" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-9 w-full rounded-[var(--radius-btn)]" />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-9 w-full rounded-[var(--radius-btn)]" />
              </div>
            ))}
          </div>

          <div className="divide-y divide-hairline overflow-hidden rounded-[var(--radius-inner)] border border-hairline">
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

          <div className="flex items-center justify-end gap-2 border-t border-hairline pt-5">
            <Skeleton className="h-9 w-28 rounded-[var(--radius-btn)]" />
          </div>
        </div>
      </section>
    </div>
  );
}
