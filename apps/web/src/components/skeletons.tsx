import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { tileClass } from "@/components/dashboard/widgets/primitives";

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
      className={className}
    >
      {children}
    </div>
  );
}

/**
 * Root of a loading tree: aria-busy plus a screen-reader "Loading…" label.
 * The label sits outside the spaced column so `space-y-*` on `className`
 * never counts it as a sibling.
 */
export function SkeletonRegion({
  children,
  className,
  label = "Loading…",
}: {
  children: React.ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className={className}>{children}</div>
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

/** Mirrors StatTile: inset block, label row, 28px number, optional hint. */
export function StatTileSkeleton({
  className,
  accent,
}: {
  className?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-[var(--radius-inner)] bg-card-inset px-4 py-3.5",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className={cn("size-4 rounded", accent && "bg-lime-wash")} />
      </div>
      <Skeleton className="mt-1 h-7 w-14" />
      <Skeleton className="mt-1 h-3 w-24" />
    </div>
  );
}

/**
 * Mirrors StatTile exactly (components/ui/stat-tile.tsx): 16px label row,
 * 28px number line box, 16px hint line. `labelPill` matches StatusPill labels.
 */
export function KpiTileSkeleton({
  labelPill = false,
  hint = true,
  className,
}: {
  labelPill?: boolean;
  hint?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-[var(--radius-inner)] bg-card-inset px-4 py-3.5",
        className,
      )}
    >
      <div className={cn("flex items-center", labelPill ? "h-5" : "h-4")}>
        <Skeleton className={labelPill ? "h-5 w-16 rounded-full" : "h-3 w-20"} />
      </div>
      <div className="flex h-7 items-center">
        <Skeleton className="h-6 w-14" />
      </div>
      {hint ? (
        <div className="flex h-4 items-center">
          <Skeleton className="h-3 w-24" />
        </div>
      ) : null}
    </div>
  );
}

/** Stat strip inside a `p-3` card (jobs overview): 2 cols, 4 on lg. */
export function KpiStripSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={cn(tileClass, "p-3")}>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {Array.from({ length: count }).map((_, i) => (
          <KpiTileSkeleton key={i} labelPill />
        ))}
      </div>
    </div>
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
      <div className={cn(tileClass, "p-3")}>
        <div className={cn("grid grid-cols-2 gap-2", columns, className)}>
          {Array.from({ length: count }).map((_, i) => (
            <StatTileSkeleton key={i} accent={i === 2} />
          ))}
        </div>
      </div>
    </SkeletonContainer>
  );
}

/** Mirrors TileHeader: 32px icon chip, 15px title, optional action on the right. */
export function TileHeaderSkeleton({
  titleWidth = "w-32",
  action = false,
}: {
  titleWidth?: string;
  action?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-5 pt-5">
      <div className="flex min-w-0 items-center gap-2.5">
        <Skeleton className="size-8 shrink-0 rounded-[var(--radius-btn)]" />
        <Skeleton className={cn("h-4", titleWidth)} />
      </div>
      {action ? <Skeleton className="h-7 w-16 rounded-[var(--radius-btn)]" /> : null}
    </div>
  );
}

/**
 * Mirrors Tile + TileHeader + TileRow: 16px card, 32px icon chip, rows of
 * 40px avatar with two text lines and a trailing control.
 */
export function TileSkeleton({
  rows = 3,
  className,
  headerAction = true,
  trailing = "badge",
  titleWidth = "w-32",
}: {
  rows?: number;
  className?: string;
  headerAction?: boolean;
  trailing?: "badge" | "button" | "none";
  titleWidth?: string;
}) {
  return (
    <div className={cn(tileClass, "flex h-full min-w-0 flex-col pb-3", className)}>
      <TileHeaderSkeleton titleWidth={titleWidth} action={headerAction} />
      <div className="mt-3 flex flex-1 flex-col gap-1 px-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-full max-w-[12rem]" />
              <Skeleton className="h-3 w-20" />
            </div>
            {trailing === "badge" ? (
              <Skeleton className="h-6 w-14 shrink-0 rounded-full" />
            ) : trailing === "button" ? (
              <Skeleton className="h-8 w-20 shrink-0 rounded-[var(--radius-btn)]" />
            ) : null}
          </div>
        ))}
      </div>
    </div>
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
    <Card className={cn("gap-0 divide-y divide-hairline overflow-hidden py-0", className)}>
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
        <div className="grid border-b border-hairline bg-card-inset px-4 py-2.5 sm:px-5">
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
      <div className="divide-y divide-hairline">
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

/* ── Page chrome ─────────────────────────────────────────────────────────── */

/**
 * Mirrors PageTitleRow / the title rows on the list pages: a 36px title line
 * (28px type), optional 20px description, and right-aligned action buttons
 * (36px high). The shell draws the title for routes listed in nav-items with
 * `shellTitle`, so those pages must not use this for the title.
 */
export function PageTitleRowSkeleton({
  titleWidth = "w-44",
  description = false,
  actionWidths = ["w-28"],
  className,
}: {
  titleWidth?: string;
  description?: boolean;
  actionWidths?: string[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-4 gap-y-3", className)}>
      <div className="min-w-0">
        <div className="flex h-9 items-center">
          <Skeleton className={cn("h-6", titleWidth)} />
        </div>
        {description ? (
          <div className="mt-1 flex h-5 items-center">
            <Skeleton className="h-3.5 w-80 max-w-full" />
          </div>
        ) : null}
      </div>
      {actionWidths.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {actionWidths.map((width, i) => (
            <Skeleton key={i} className={cn("h-9 rounded-[var(--radius-btn)]", width)} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Mirrors DirectoryTabs: underline tabs (14px labels, 12px below) on a hairline. */
export function DirectoryTabsSkeleton({
  widths = ["w-16", "w-20"],
}: {
  widths?: string[];
}) {
  return (
    <div className="flex gap-6 border-b border-hairline">
      {widths.map((width, i) => (
        <div key={i} className="flex flex-col justify-end pb-3">
          <div className="flex h-5 items-center">
            <Skeleton className={cn("h-3.5", width)} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Directory tables ────────────────────────────────────────────────────── */

export type SkeletonColumn = {
  /** Wrapper width, e.g. "w-24". */
  width: string;
  /** Breakpoint below which the column is hidden (mirrors the real table). */
  hide?: "sm" | "md" | "lg";
  /** Render as a 24px status pill instead of a text line. */
  pill?: boolean;
};

const hideClass = {
  sm: "hidden sm:block",
  md: "hidden md:block",
  lg: "hidden lg:block",
} as const;

/**
 * Table body mirroring the People directory (`dirTable`: 44px header on a card
 * inset, 60px rows with a hairline) or the HumanTable (no row borders, 60px
 * rows, rounded). `identity` is the 48px avatar or the 36px rounded chip.
 */
export function DirectoryTableSkeleton({
  variant = "directory",
  rows = 7,
  identity = "avatar",
  columns = [],
  checkbox = true,
  actions = true,
}: {
  variant?: "directory" | "human";
  rows?: number;
  identity?: "avatar" | "chip";
  columns?: SkeletonColumn[];
  checkbox?: boolean;
  actions?: boolean;
}) {
  const isDirectory = variant === "directory";
  const headClass = isDirectory
    ? "flex h-11 items-center gap-4 bg-card-inset px-5"
    : "flex h-8 items-end gap-4 px-4 pb-2";
  const rowClass = isDirectory
    ? "flex h-[60px] items-center gap-4 border-t border-hairline px-5"
    : "flex h-[var(--spacing-row)] items-center gap-4 rounded-[var(--radius-row)] px-4";

  return (
    <div className={isDirectory ? "overflow-x-auto" : "px-2 pb-3"}>
      <div className={headClass}>
        {checkbox ? <Skeleton className="size-4 shrink-0 rounded-sm" /> : null}
        <div className="min-w-0 flex-1">
          <Skeleton className="h-3 w-20" />
        </div>
        {columns.map((column, i) => (
          <div key={i} className={cn("shrink-0", column.width, column.hide && hideClass[column.hide])}>
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
        {actions ? <div className="w-8 shrink-0" /> : null}
      </div>

      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className={rowClass}>
          {checkbox ? <Skeleton className="size-4 shrink-0 rounded-sm" /> : null}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {identity === "chip" ? (
              <Skeleton className="size-9 shrink-0 rounded-[var(--radius-inner)]" />
            ) : (
              <Skeleton className="size-12 shrink-0 rounded-full" />
            )}
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-40 max-w-full" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
          {columns.map((column, i) => (
            <div key={i} className={cn("shrink-0", column.width, column.hide && hideClass[column.hide])}>
              {column.pill ? (
                <Skeleton className="h-6 w-full rounded-full" />
              ) : (
                <Skeleton className="h-3 w-full" />
              )}
            </div>
          ))}
          {actions ? <Skeleton className="size-8 shrink-0 rounded-[var(--radius-btn)]" /> : null}
        </div>
      ))}
    </div>
  );
}

/**
 * The white directory card (filter bar, total line, table). Mirrors
 * DirectoryCard / FilterBar / TotalLine in features/candidates/directory-chrome
 * and the JobsTable card (`variant="human"`).
 */
export function DirectoryCardSkeleton({
  variant = "directory",
  search = true,
  countButton = true,
  chips = [],
  trailing,
  total = true,
  rows = 7,
  identity = "avatar",
  columns = [],
  checkbox = true,
  actions = true,
  className,
}: {
  variant?: "directory" | "human";
  search?: boolean;
  countButton?: boolean;
  chips?: string[];
  /** Width class of a button pushed to the right of the filter bar. */
  trailing?: string;
  total?: boolean;
  rows?: number;
  identity?: "avatar" | "chip";
  columns?: SkeletonColumn[];
  checkbox?: boolean;
  actions?: boolean;
  className?: string;
}) {
  return (
    <Card className={cn("gap-0 overflow-hidden py-0", className)}>
      <div className="flex flex-wrap items-center gap-2 px-5 py-4">
        {search ? <Skeleton className="h-9 w-full rounded-full sm:w-64" /> : null}
        {countButton ? <Skeleton className="h-9 w-10 rounded-full" /> : null}
        {chips.map((width, i) => (
          <Skeleton key={i} className={cn("h-9 rounded-full", width)} />
        ))}
        {trailing ? <Skeleton className={cn("ml-auto h-9 rounded-full", trailing)} /> : null}
      </div>
      {total ? (
        <div className="flex min-h-12 items-center border-t border-hairline px-5 py-3">
          <Skeleton className="h-3.5 w-28" />
        </div>
      ) : null}
      <DirectoryTableSkeleton
        variant={variant}
        rows={rows}
        identity={identity}
        columns={columns}
        checkbox={checkbox}
        actions={actions}
      />
    </Card>
  );
}

/* ── Profile and detail cards ────────────────────────────────────────────── */

/** Mirrors InfoRows / InfoRow: 44px inset rows, label left, value right. */
export function InfoRowsSkeleton({
  rows = 3,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  const valueWidths = ["w-28", "w-36", "w-20", "w-44", "w-24"];
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex min-h-11 items-center justify-between gap-4 rounded-[var(--radius-inner)] bg-card-inset px-4 py-2.5"
        >
          <Skeleton className="h-3.5 w-14" />
          <Skeleton className={cn("h-3.5", valueWidths[i % valueWidths.length])} />
        </div>
      ))}
    </div>
  );
}

/**
 * Titled card (Card + CardHeader + CardContent) holding either info rows or
 * text lines. Mirrors the Contact / Specialties / About cards on profile pages.
 */
export function InfoCardSkeleton({
  body = "rows",
  count = 3,
  titleWidth = "w-20",
  className,
}: {
  body?: "rows" | "text";
  count?: number;
  titleWidth?: string;
  className?: string;
}) {
  const textWidths = ["w-full", "w-11/12", "w-4/5", "w-full", "w-2/3"];
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex h-5 items-center">
          <Skeleton className={cn("h-4", titleWidth)} />
        </div>
      </CardHeader>
      <CardContent>
        {body === "rows" ? (
          <InfoRowsSkeleton rows={count} />
        ) : (
          <div className="space-y-2">
            {Array.from({ length: count }).map((_, i) => (
              <Skeleton key={i} className={cn("h-3.5", textWidths[i % textWidths.length])} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Mirrors TileHeader + inset 2x2 KPI grid (AtAGlance). */
export function AtAGlanceSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn(tileClass, "flex h-full min-w-0 max-w-full flex-col", className)}>
      <TileHeaderSkeleton titleWidth="w-24" />
      <div className="grid grid-cols-2 gap-2 px-5 pb-5 pt-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <KpiTileSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/** Inbox workspace card: conversation list, reader, side pane (mirrors RecruitingInbox). */
export function InboxSkeleton() {
  const pills = ["w-12", "w-[4.5rem]", "w-24", "w-28", "w-[5.5rem]"];
  return (
    <SkeletonRegion>
      <div className="flex h-[calc(100dvh-15rem)] min-h-[34rem] min-w-0 flex-col overflow-hidden rounded-[var(--radius-card)] bg-card shadow-[var(--shadow-card)]">
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          {/* Conversation list: search, filter pills, rows. Full width on phones. */}
          <div className="min-h-0 w-full shrink-0 border-r border-hairline bg-card lg:w-[340px] xl:w-[360px]">
            <div className="space-y-2.5 border-b border-hairline px-3 py-3">
              <div className="flex items-center gap-1.5">
                <Skeleton className="h-9 flex-1 rounded-full" />
                <Skeleton className="size-8 shrink-0 rounded-[var(--radius-btn)]" />
              </div>
              <div className="flex items-center gap-1.5 overflow-hidden">
                {pills.map((width, i) => (
                  <Skeleton key={i} className={cn("h-8 shrink-0 rounded-full", width)} />
                ))}
              </div>
            </div>
            <ul className="px-2 py-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className="flex items-start gap-3 rounded-[var(--radius-inner)] px-3 py-3">
                  <Skeleton className="size-9 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-44 max-w-full" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Reader. */}
          <div className="hidden min-h-0 min-w-0 flex-1 bg-card lg:block">
            <div className="flex items-center gap-3 border-b border-hairline px-5 py-3.5">
              <Skeleton className="size-9 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
            <div className="space-y-4 px-5 py-5">
              <Skeleton className="h-16 w-[70%] rounded-[var(--radius-card)]" />
              <Skeleton className="ml-auto h-12 w-[55%] rounded-[var(--radius-card)]" />
              <Skeleton className="h-20 w-[75%] rounded-[var(--radius-card)]" />
            </div>
          </div>

          {/* Side pane: candidate details and actions. */}
          <aside className="hidden min-h-0 w-[300px] shrink-0 border-l border-hairline bg-card-inset/50 p-4 xl:block">
            <div className="space-y-3">
              <Skeleton className="h-32 w-full rounded-[var(--radius-card)]" />
              <Skeleton className="h-9 w-full rounded-[var(--radius-btn)]" />
              <Skeleton className="h-9 w-full rounded-[var(--radius-btn)]" />
            </div>
          </aside>
        </div>
      </div>
    </SkeletonRegion>
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
          <div className="grid grid-cols-7 border-b border-border bg-card-inset">
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
 * Dashboard home skeleton. Mirrors DashboardPage: centered greeting (32/40px
 * title, 20px subline), then a two-column grid of widget tiles (left: the work,
 * right: context). Tile counts follow the real page's typical content.
 */
export function DashboardSkeleton() {
  return (
    <SkeletonRegion className="mx-auto w-full max-w-[1200px] pb-6">
      <header className="px-4 pb-2 pt-6 text-center sm:pt-8">
        <div className="mx-auto flex h-[2.2rem] items-center justify-center sm:h-11">
          <Skeleton className="h-7 w-72 max-w-full sm:h-9" />
        </div>
        <div className="mx-auto mt-2 flex h-5 max-w-xl items-center justify-center">
          <Skeleton className="h-3.5 w-80 max-w-full" />
        </div>
      </header>

      <div className="mt-6 grid items-start gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <TileSkeleton rows={4} trailing="button" titleWidth="w-36" />
          <TileSkeleton rows={3} titleWidth="w-56" headerAction />
          <TileSkeleton rows={3} titleWidth="w-40" />
          <TileSkeleton rows={3} titleWidth="w-28" />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <AtAGlanceSkeleton />
          <TileSkeleton rows={3} titleWidth="w-36" />
          <TileSkeleton rows={3} titleWidth="w-24" />
        </div>
      </div>
    </SkeletonRegion>
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
              className="w-56 shrink-0 rounded-[var(--radius-card)] bg-card-inset lg:w-64"
            >
              <div className="p-3">
                <Skeleton className="h-4 w-20" />
              </div>
              <div className="space-y-2 p-2">
                <Skeleton className="h-16 rounded-[var(--radius-inner)] bg-pure-snow shadow-[var(--shadow-card)]" />
                <Skeleton className="h-16 rounded-[var(--radius-inner)] bg-pure-snow shadow-[var(--shadow-card)]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonContainer>
  );
}
