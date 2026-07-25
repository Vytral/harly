import Link from "next/link";
import type { Route } from "next";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type TriageItem = {
  label: string;
  value: number;
  href: Route;
  /** Draws attention only when the number represents work that is late. */
  urgent?: boolean;
};

/**
 * The answer to "what needs me right now", above everything else on Home.
 *
 * Not a bento of six equal metric cards , that was the old dashboard's mistake
 * and it made nothing important. This is one thin strip of countable, clickable
 * work: each tile is a number and a destination, sized so the whole row costs
 * one glance. The widgets below are the detail; this is the triage.
 *
 * A zero is shown, not hidden. "0 waiting on you" is information a recruiter
 * wants at 9:12am, and a strip that changes shape daily is harder to read.
 */
export function TriageStrip({ items }: { items: TriageItem[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className={cn(
            "group flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border px-4 py-3.5 transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink",
            item.urgent && item.value > 0
              ? "border-warning-clay/25 bg-warning-clay/[0.05] hover:bg-warning-clay/10"
              : "border-hairline bg-pure-snow hover:bg-row-wash",
          )}
        >
          <span className="min-w-0">
            <span
              className={cn(
                "tabular block text-[26px] font-medium leading-none tracking-[-0.02em]",
                item.urgent && item.value > 0
                  ? "text-warning-clay"
                  : "text-near-ink",
              )}
            >
              {item.value}
            </span>
            <span className="mt-1.5 block truncate text-[13px] text-soft-ink">
              {item.label}
            </span>
          </span>
          <ArrowRight
            className="size-4 shrink-0 text-quiet-mist transition-transform group-hover:translate-x-0.5"
            strokeWidth={1.8}
          />
        </Link>
      ))}
    </div>
  );
}
