import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors settings/signature/page.tsx → SignatureSettingsCard: one card with
 * the header and status pill, the four toggle rows plus the OTP toggle and the
 * expiration input, and the Discard/Save footer. The saved-signatures card is
 * only rendered when that toggle is on, so it is not reserved here.
 */
export default function SignatureSettingsLoading() {
  return (
    <div aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading…</span>

      <Card className="gap-5 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-btn)] border border-hairline bg-pure-snow">
              <Skeleton className="size-5 rounded-sm" />
            </div>
            <div className="space-y-2 pt-0.5">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className="h-3.5 w-[34rem] max-w-full" />
              <Skeleton className="h-3.5 w-80 max-w-full" />
            </div>
          </div>
        </div>

        <div className="-mx-6 divide-y divide-hairline border-t border-hairline">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-6 px-6 py-4">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-48" />
                <Skeleton className="h-3 w-80 max-w-full" />
              </div>
              {i === 5 ? (
                <Skeleton className="h-9 w-24 rounded-[var(--radius-btn)]" />
              ) : (
                <Skeleton className="h-5 w-9 shrink-0 rounded-full" />
              )}
            </div>
          ))}
        </div>

        <div className="-mx-6 -mb-6 flex items-center justify-end gap-2 border-t border-hairline px-5 py-3">
          <Skeleton className="h-9 w-24 rounded-[var(--radius-btn)]" />
          <Skeleton className="h-9 w-32 rounded-[var(--radius-btn)]" />
        </div>
      </Card>
    </div>
  );
}
