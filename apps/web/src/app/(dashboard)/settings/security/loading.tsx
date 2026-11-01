import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function SecurityHeaderSkeleton({
  titleWidth,
  descWidth,
  control,
}: {
  titleWidth: string;
  descWidth: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-4">
        <div className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-btn)] border border-hairline bg-pure-snow">
          <Skeleton className="size-5 rounded-sm" />
        </div>
        <div className="space-y-2 pt-0.5">
          <div className="flex items-center gap-2">
            <Skeleton className={`h-4 ${titleWidth}`} />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className={`h-3.5 ${descWidth} max-w-full`} />
        </div>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function SwitchSkeleton() {
  return <Skeleton className="h-5 w-9 shrink-0 rounded-full" />;
}

function RowsSkeleton({ count }: { count: number }) {
  return (
    <div className="-mx-6 divide-y divide-hairline border-t border-hairline">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-6 px-6 py-4">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-44" />
            <Skeleton className="h-3 w-72 max-w-full" />
          </div>
          <SwitchSkeleton />
        </div>
      ))}
    </div>
  );
}

/**
 * Mirrors settings/security/page.tsx: the 2FA enforcement card, the enterprise
 * access controls card (form grid and switch rows), the SSO provider card, the
 * login methods card, the SCIM provisioning card, and the audit log table.
 */
export default function SecuritySettingsLoading() {
  return (
    <div aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading…</span>

      <Card className="gap-5 p-6">
        <SecurityHeaderSkeleton titleWidth="w-64" descWidth="w-[32rem]" control={<SwitchSkeleton />} />
      </Card>

      <Card className="gap-5 p-6">
        <SecurityHeaderSkeleton
          titleWidth="w-56"
          descWidth="w-[30rem]"
          control={null}
        />
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-9 w-full rounded-[var(--radius-btn)]" />
              <Skeleton className="h-3 w-56 max-w-full" />
            </div>
          ))}
        </div>
        <RowsSkeleton count={2} />
      </Card>

      <Card className="gap-5 p-6">
        <SecurityHeaderSkeleton titleWidth="w-40" descWidth="w-[26rem]" control={null} />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4 rounded-[var(--radius-inner)] bg-card-inset px-4 py-3">
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-lg" />
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <Skeleton className="h-8 w-24 rounded-lg" />
            </div>
          ))}
        </div>
      </Card>

      <Card className="gap-5 p-6">
        <SecurityHeaderSkeleton titleWidth="w-36" descWidth="w-[28rem]" control={null} />
        <RowsSkeleton count={4} />
        <Skeleton className="h-3.5 w-[30rem] max-w-full" />
      </Card>

      <Card className="gap-5 p-6">
        <SecurityHeaderSkeleton titleWidth="w-40" descWidth="w-[28rem]" control={null} />
        <div className="flex h-11 items-center rounded-xl border border-border/70 bg-muted/20 px-4">
          <Skeleton className="h-3.5 w-80 max-w-full" />
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-9 w-full rounded-[var(--radius-btn)]" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-9 w-full rounded-[var(--radius-btn)]" />
          </div>
          <Skeleton className="h-9 w-32 rounded-[var(--radius-btn)]" />
        </div>
        <div className="divide-y divide-border/70 rounded-xl border border-border/70">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-44" />
              </div>
              <Skeleton className="h-7 w-16 rounded-lg" />
            </div>
          ))}
        </div>
      </Card>

      <Card className="gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <Skeleton className="h-9 w-24 rounded-[var(--radius-btn)]" />
        </div>
        <div className="grid grid-cols-[1fr_1fr_1.5fr] gap-4 border-b border-hairline bg-card-inset px-5 py-2.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
        <div className="divide-y divide-hairline">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1.5fr] items-center gap-4 px-5 py-3">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3.5 w-40 max-w-full" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
