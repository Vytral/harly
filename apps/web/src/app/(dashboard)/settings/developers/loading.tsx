import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function SectionHeaderSkeleton({
  titleWidth,
  descWidth,
  withAction = true,
}: {
  titleWidth: string;
  descWidth: string;
  withAction?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-4">
        <div className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-btn)] border border-hairline bg-pure-snow">
          <Skeleton className="size-5 rounded-sm" />
        </div>
        <div className="space-y-2 pt-0.5">
          <Skeleton className={`h-4 ${titleWidth}`} />
          <Skeleton className={`h-3.5 ${descWidth} max-w-full`} />
        </div>
      </div>
      {withAction ? <Skeleton className="h-9 w-28 shrink-0 rounded-[var(--radius-btn)]" /> : null}
    </div>
  );
}

/**
 * Mirrors settings/developers/page.tsx → DevelopersSettings: API keys card
 * (key rows), webhooks card (endpoint rows), embed widget card (variant chips
 * and a code block).
 */
export default function DevelopersSettingsLoading() {
  return (
    <div aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading…</span>

      <Card className="gap-5 p-6">
        <SectionHeaderSkeleton titleWidth="w-24" descWidth="w-96" />
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-start justify-between gap-3 rounded-xl border bg-card px-4 py-3.5">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-3 w-56 max-w-full font-mono" />
              </div>
              <Skeleton className="h-8 w-8 shrink-0 rounded-[var(--radius-btn)]" />
            </div>
          ))}
        </div>
      </Card>

      <Card className="gap-5 p-6">
        <SectionHeaderSkeleton titleWidth="w-20" descWidth="w-[26rem]" />
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3 rounded-xl border bg-card px-4 py-3.5">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
            <Skeleton className="h-5 w-14 shrink-0 rounded-full" />
          </div>
        </div>
      </Card>

      <Card className="gap-5 p-6">
        <SectionHeaderSkeleton titleWidth="w-28" descWidth="w-[32rem]" withAction={false} />
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-3.5 w-80 max-w-full" />
        <div className="overflow-hidden rounded-2xl border bg-muted/30">
          <div className="flex items-center justify-between border-b bg-muted/60 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5">
                <Skeleton className="size-2.5 rounded-full" />
                <Skeleton className="size-2.5 rounded-full" />
                <Skeleton className="size-2.5 rounded-full" />
              </span>
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className="h-7 w-16 rounded-md" />
          </div>
          <div className="space-y-2 p-4">
            {["w-5/6", "w-2/3", "w-full", "w-3/4", "w-1/2"].map((width, i) => (
              <Skeleton key={i} className={`h-3 ${width}`} />
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
