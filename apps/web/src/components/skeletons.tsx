import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shared skeleton building blocks for the whole app.
 *
 * Keep these layout-faithful: the shape and spacing should mirror the real
 * components so the transition from loading → loaded is visually stable.
 */

type SkeletonContainerProps = {
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
};

function SkeletonContainer({
  children,
  className,
  ariaLabel = "Loading content",
}: SkeletonContainerProps) {
  return (
    <div
      aria-busy="true"
      aria-label={ariaLabel}
      className={cn("animate-pulse", className)}
    >
      {children}
    </div>
  );
}

/** Header block: eyebrow + title + description + optional actions. */
export function PageHeaderSkeleton({
  hasEyebrow = true,
  hasDescription = true,
  hasActions = true,
  actionCount = 1,
  className,
}: {
  hasEyebrow?: boolean;
  hasDescription?: boolean;
  hasActions?: boolean;
  actionCount?: number;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between",
        className,
      )}
    >
      <div className="space-y-1.5">
        {hasEyebrow ? <Skeleton className="h-3 w-16" /> : null}
        <Skeleton className="h-8 w-56" />
        {hasDescription ? <Skeleton className="h-4 w-80 max-w-full" /> : null}
      </div>
      {hasActions ? (
        <div className="flex flex-wrap items-center gap-2">
          {Array.from({ length: actionCount }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-28 rounded-lg" />
          ))}
        </div>
      ) : null}
    </header>
  );
}

/** Generic stat tile (icon + value + label + hint). */
export function StatTileSkeleton({
  className,
  accent,
}: {
  className?: string;
  accent?: boolean;
}) {
  return (
    <Card className={cn("p-4", className)}>
      <CardContent className="flex items-center justify-between p-0">
        <Skeleton className="h-3 w-20" />
        <Skeleton
          className={cn("size-8 rounded-xl", accent ? "bg-primary/20" : "")}
        />
      </CardContent>
      <Skeleton className="mt-4 h-7 w-16" />
      <Skeleton className="mt-1 h-3 w-28" />
    </Card>
  );
}

/** A row of stat tiles. */
export function StatsGridSkeleton({
  count = 4,
  columns = "lg:grid-cols-4",
  className,
}: {
  count?: number;
  columns?: string;
  className?: string;
}) {
  return (
    <SkeletonContainer ariaLabel="Loading stats">
      <div
        className={cn(
          "grid grid-cols-2 gap-3",
          columns,
          className,
        )}
      >
        {Array.from({ length: count }).map((_, i) => (
          <StatTileSkeleton key={i} accent={i === 2} />
        ))}
      </div>
    </SkeletonContainer>
  );
}

/** Dashboard tile shell with header + body rows. */
export function TileSkeleton({
  rows = 3,
  className,
  headerAction = true,
}: {
  rows?: number;
  className?: string;
  headerAction?: boolean;
}) {
  return (
    <Card className={cn("flex h-full flex-col", className)}>
      <CardContent className="flex flex-1 flex-col p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Skeleton className="size-4 rounded" />
            <Skeleton className="h-4 w-32" />
          </div>
          {headerAction ? <Skeleton className="h-3 w-16" /> : null}
        </div>
        <div className="mt-4 flex flex-1 flex-col gap-3">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-full max-w-[12rem]" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** List item with an avatar/icon, primary + secondary text, and trailing badge. */
export function ListItemSkeleton({
  avatar = true,
  lines = 2,
  trailing = "badge",
  className,
}: {
  avatar?: boolean;
  lines?: 1 | 2;
  trailing?: "badge" | "text" | "none";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 py-3",
        className,
      )}
    >
      {avatar ? <Skeleton className="size-9 shrink-0 rounded-full" /> : null}
      <div className="flex-1 space-y-1.5">
        <Skeleton
          className={cn("h-3.5", lines === 2 ? "w-40" : "w-full max-w-[14rem]")}
        />
        {lines === 2 ? <Skeleton className="h-3 w-24" /> : null}
      </div>
      {trailing === "badge" ? (
        <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
      ) : trailing === "text" ? (
        <Skeleton className="h-3 w-20 shrink-0" />
      ) : null}
    </div>
  );
}

/** Card containing stacked list rows. */
export function CardListSkeleton({
  count = 5,
  avatar = true,
  lines = 2,
  trailing = "badge",
  className,
}: {
  count?: number;
  avatar?: boolean;
  lines?: 1 | 2;
  trailing?: "badge" | "text" | "none";
  className?: string;
}) {
  return (
    <Card className={cn("gap-0 divide-y divide-border/60 overflow-hidden py-0", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="px-4 sm:px-5">
          <ListItemSkeleton avatar={avatar} lines={lines} trailing={trailing} />
        </div>
      ))}
    </Card>
  );
}

/** Table with header + rows. */
export function TableSkeleton({
  rows = 6,
  columns = 5,
  showHeader = true,
  className,
}: {
  rows?: number;
  columns?: number;
  showHeader?: boolean;
  className?: string;
}) {
  return (
    <Card className={cn("gap-0 overflow-hidden py-0", className)}>
      {showHeader ? (
        <div className="grid border-b border-border/60 bg-muted/40 px-4 py-2.5 sm:px-5">
          <div className="flex gap-3">
            {Array.from({ length: columns }).map((_, i) => (
              <Skeleton
                key={i}
                className={cn(
                  "h-3",
                  i === 0 ? "w-1/3" : "w-full",
                )}
              />
            ))}
          </div>
        </div>
      ) : null}
      <div className="divide-y divide-border/60">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
            {Array.from({ length: Math.max(0, columns - 2) }).map((_, j) => (
              <Skeleton
                key={j}
                className="hidden h-3 w-20 shrink-0 sm:block"
              />
            ))}
            <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Generic form section with label + input blocks. */
export function FormSkeleton({
  fields = 4,
  columns = 1,
  className,
}: {
  fields?: number;
  columns?: 1 | 2;
  className?: string;
}) {
  return (
    <Card className={cn("p-5", className)}>
      <div className={cn("grid gap-5", columns === 2 && "sm:grid-cols-2")}>
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ))}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Skeleton className="h-9 w-24 rounded-lg" />
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
    </Card>
  );
}

/** Month calendar grid (7 columns x 6 rows). */
export function CalendarSkeleton({ className }: { className?: string }) {
  return (
    <SkeletonContainer ariaLabel="Loading calendar" className={className}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1.5">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
          <div className="flex items-center gap-1">
            <Skeleton className="size-8 rounded-md" />
            <Skeleton className="h-8 w-28 rounded-md" />
            <Skeleton className="size-8 rounded-md" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/50 p-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-32 rounded-md" />
          ))}
        </div>
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="grid grid-cols-7 border-b border-border bg-muted/40">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="mx-auto my-2 h-3 w-8" />
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: 42 }).map((_, i) => (
              <Skeleton
                key={i}
                className="min-h-24 border-b border-r border-border"
              />
            ))}
          </div>
        </div>
      </div>
    </SkeletonContainer>
  );
}

/** Settings page shell with sticky nav + content placeholder.
 *
 *  Renders the full settings layout (nav + content) because the settings
 *  layout itself is async and loads permissions. Pass `children` to replace
 *  the default stacked form cards with a custom skeleton.
 */
export function SettingsSkeleton({
  cards = 3,
  className,
  children,
}: {
  cards?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-6", className)}>
      <div className="grid gap-6 lg:grid-cols-[248px_minmax(0,1fr)] xl:gap-8">
        <aside className="hidden lg:block lg:sticky lg:top-20 lg:self-start">
          <Card className="p-3">
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className={cn("h-9 w-full rounded-lg", i === 0 && "bg-primary/10")}
                />
              ))}
            </div>
          </Card>
        </aside>
        <div className="min-w-0 space-y-6">
          {children ?? Array.from({ length: cards }).map((_, i) => (
            <FormSkeleton key={i} fields={3 + (i % 2)} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Dashboard home skeleton , mirrors DashboardPage exactly (greeting, triage
 * strip, then three 3/2-col widget rows) so nothing shifts on mount.
 */
export function DashboardSkeleton() {
  return (
    <SkeletonContainer
      ariaLabel="Loading dashboard"
      className="mx-auto w-full max-w-[1440px] space-y-5 pb-4"
    >
      <header className="flex items-center gap-3">
        <Skeleton className="size-11 shrink-0 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3.5 w-64 max-w-full" />
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border/60 p-4">
            <Skeleton className="h-7 w-10" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
        ))}
      </div>

      <section className="grid gap-4 lg:grid-cols-5">
        <TileSkeleton rows={3} className="lg:col-span-3" />
        <TileSkeleton rows={3} className="lg:col-span-2" />
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <TileSkeleton rows={3} className="lg:col-span-3" />
        <TileSkeleton rows={3} className="lg:col-span-2" />
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <TileSkeleton rows={2} className="lg:col-span-2" />
        <TileSkeleton rows={2} className="lg:col-span-3" />
      </section>
    </SkeletonContainer>
  );
}

/** Pipeline kanban board skeleton. */
export function PipelineBoardSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <SkeletonContainer ariaLabel="Loading pipeline">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-10 w-full max-w-sm" />
          <Skeleton className="h-9 w-40" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-9 w-36" />
        </div>
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: columns }).map((_, index) => (
            <div
              key={index}
              className="w-56 shrink-0 rounded-xl border bg-muted/40 lg:w-64"
            >
              <div className="border-b p-2.5">
                <Skeleton className="h-4 w-20" />
              </div>
              <div className="space-y-2 p-2">
                <Skeleton className="h-20 rounded-xl" />
                <Skeleton className="h-20 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonContainer>
  );
}
