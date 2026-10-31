import Link from "next/link";
import type { Route } from "next";
import { LayoutGrid } from "lucide-react";

import { StatTile } from "@/components/ui/stat-tile";
import { Tile, TileHeader } from "./primitives";

export type GlanceItem = {
  label: string;
  value: number;
  href: Route;
  hint?: string;
};

/**
 * Replaces the old triage strip: a grid of countable tiles. Zeros stay visible
 * (a card that changes shape daily is harder to read) but read muted so live
 * numbers stand out.
 */
export function AtAGlanceCard({
  items,
  className,
}: {
  items: GlanceItem[];
  className?: string;
}) {
  return (
    <Tile className={className}>
      <TileHeader icon={LayoutGrid} title="At a glance" />
      <div className="grid grid-cols-2 gap-2 px-5 pb-5 pt-4">
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="group rounded-[var(--radius-inner)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
          >
            <StatTile
              label={item.label}
              value={item.value}
              hint={item.hint}
              muted={item.value === 0}
              className="h-full group-hover:bg-row-wash"
            />
          </Link>
        ))}
      </div>
    </Tile>
  );
}
