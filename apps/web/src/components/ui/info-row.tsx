import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A label → value pair living inside a card: a soft gray inset row with the
 * label quiet on the left and the value in ink on the right. Stack several
 * with `InfoRows` for profile / settings detail blocks.
 */
export function InfoRow({
  label,
  value,
  className,
  empty = "Not specified",
}: {
  label: React.ReactNode;
  value?: React.ReactNode;
  className?: string;
  empty?: string;
}) {
  const isEmpty = value === null || value === undefined || value === "";
  return (
    <div
      data-slot="info-row"
      className={cn(
        "flex min-h-11 items-center justify-between gap-4 rounded-[var(--radius-inner)] bg-card-inset px-4 py-2.5 text-[13.5px]",
        className,
      )}
    >
      <span className="shrink-0 text-soft-ink">{label}</span>
      <span
        className={cn(
          "min-w-0 truncate text-right font-medium",
          isEmpty ? "font-normal text-quiet-mist" : "text-near-ink",
        )}
      >
        {isEmpty ? empty : value}
      </span>
    </div>
  );
}

export function InfoRows({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5", className)} {...props} />;
}
