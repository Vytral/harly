import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** Soft white tile , 24px radius, separation by shadow rather than border. */
export const tileClass =
  "rounded-3xl border border-border/50 bg-card shadow-[0_1px_2px_rgba(23,23,23,0.04),0_4px_16px_rgba(23,23,23,0.03)]";

export function Tile({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn(tileClass, "flex h-full flex-col", className)}>{children}</div>;
}

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
    <div className="flex items-center justify-between gap-2 px-5 pt-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-muted-foreground" strokeWidth={1.8} />
        {title}
        {typeof count === "number" && count > 0 ? (
          <span className="rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground tabular-nums">
            {count}
          </span>
        ) : null}
      </h2>
      {action}
    </div>
  );
}

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
      className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-all hover:gap-1.5"
    >
      {children}
      <ArrowRight className="size-4" />
    </Link>
  );
}

export function EmptyHint({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="m-3 flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
      <Icon className="size-5 text-muted-foreground" strokeWidth={1.6} />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

/** Due / aging state → Badge variant. Carries urgency through colour. */
export const dueVariant: Record<"overdue" | "today" | "soon", "danger" | "warning" | "neutral"> = {
  overdue: "danger",
  today: "warning",
  soon: "neutral",
};
