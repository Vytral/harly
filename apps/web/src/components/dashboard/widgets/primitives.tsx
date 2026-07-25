import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Widget shell.
 *
 * Was a 24px-radius tile with a two-layer drop shadow , the "card farm" look.
 * Depth in Harly comes from luminance and spacing (DESIGN.md , Shadows), so a
 * tile is now a soft 16px rectangle on a hairline with at most `shadow-soft`.
 * Panels are rectangles; only chips and CTAs are pills.
 */
export const tileClass =
  "rounded-[var(--radius-lg)] border border-hairline bg-pure-snow";

export function Tile({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(tileClass, "flex h-full flex-col", className)}>
      {children}
    </div>
  );
}

/**
 * Widget header. The title is content, so it stays in the speaking face; the
 * count is a label, so it takes the chrome face , the same split the human
 * table uses for names versus status pills.
 */
export function TileHeader({
  icon: Icon,
  title,
  count,
  action,
}: {
  icon: LucideIcon;
  title: string;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-5 pt-4">
      <h2 className="flex items-center gap-2 text-[15px] font-medium text-near-ink">
        <Icon className="size-4 text-soft-ink" strokeWidth={1.8} />
        {title}
        {typeof count === "number" && count > 0 ? (
          <span className="font-chrome rounded-full bg-soft-kraft px-1.5 text-[11px] leading-[18px] text-soft-ink tabular">
            {count}
          </span>
        ) : null}
      </h2>
      {action}
    </div>
  );
}

/** Quiet text link. Ink, not the accent , a "view all" is not a live signal. */
export function TileLink({
  href,
  children,
}: {
  href: Route;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-md text-[13px] font-medium text-soft-ink transition-colors hover:text-near-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
    >
      {children}
      <ArrowRight className="size-3.5" />
    </Link>
  );
}

export function EmptyHint({
  icon: Icon,
  text,
}: {
  icon: LucideIcon;
  text: string;
}) {
  return (
    <div className="m-4 flex flex-1 flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] bg-warm-paper px-6 py-10 text-center">
      <Icon className="size-5 text-quiet-mist" strokeWidth={1.6} />
      <p className="text-[13px] text-soft-ink">{text}</p>
    </div>
  );
}

/**
 * A row inside a widget. Shares the human table's hover wash so a list of
 * people reads the same everywhere in the product.
 */
export function TileRow({
  href,
  className,
  children,
}: {
  href?: Route;
  className?: string;
  children: React.ReactNode;
}) {
  const shell = cn(
    "flex items-center gap-3 px-3 py-2.5 transition-colors",
    "rounded-[var(--radius-md)] hover:bg-row-wash",
    className,
  );
  if (!href) return <div className={shell}>{children}</div>;
  return (
    <Link
      href={href}
      className={cn(
        shell,
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink",
      )}
    >
      {children}
    </Link>
  );
}

/** Due / aging state → Badge variant. Carries urgency through colour. */
export const dueVariant: Record<
  "overdue" | "today" | "soon",
  "danger" | "warning" | "neutral"
> = {
  overdue: "danger",
  today: "warning",
  soon: "neutral",
};
