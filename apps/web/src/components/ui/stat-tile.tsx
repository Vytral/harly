import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * KPI tile: one big tabular number with a quiet label. Sits inside a card on
 * the inset fill; `selected` lifts it to white with an ink outline (the tile
 * that is driving the view below it).
 */
export function StatTile({
  label,
  value,
  hint,
  icon,
  selected,
  muted,
  className,
  ...props
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  selected?: boolean;
  /** Zero / inactive values read lighter so live numbers stand out. */
  muted?: boolean;
} & Omit<React.ComponentProps<"div">, "children">) {
  return (
    <div
      data-slot="stat-tile"
      data-selected={selected || undefined}
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-[var(--radius-inner)] bg-card-inset px-4 py-3.5 transition-[background-color,box-shadow]",
        selected && "bg-pure-snow shadow-[inset_0_0_0_1.5px_var(--near-ink)]",
        className,
      )}
      {...props}
    >
      <div className="flex items-center justify-between gap-2 text-[12.5px] font-medium text-soft-ink">
        <span className="truncate">{label}</span>
        {icon}
      </div>
      <div
        className={cn(
          "font-display text-[28px] leading-none tabular-nums",
          muted ? "text-quiet-mist" : "text-near-ink",
        )}
      >
        {value}
      </div>
      {hint ? <div className="text-[12px] text-soft-ink">{hint}</div> : null}
    </div>
  );
}
