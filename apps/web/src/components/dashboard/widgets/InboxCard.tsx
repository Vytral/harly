import Link from "next/link";
import type { Route } from "next";
import { FileCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { InboxItem } from "@/features/dashboard/widgets";
import { Tile, TileHeader, TileLink } from "./primitives";

function waitingLabel(days: number) {
  if (days <= 0) return "New today";
  return `Waiting ${days} day${days === 1 ? "" : "s"}`;
}

/**
 * Decisions waiting on the viewer that are not candidate reviews: job
 * descriptions to approve. (Candidate reviews are in "Candidates needing your
 * review", so nothing is listed twice.) Home hides this card when empty.
 */
export function InboxCard({
  inbox,
  className,
}: {
  inbox: { total: number; items: InboxItem[] };
  className?: string;
}) {
  return (
    <Tile className={className}>
      <TileHeader
        icon={FileCheck}
        title="Decisions waiting"
        count={inbox.total}
        action={<TileLink href="/dashboard/jobs">Jobs</TileLink>}
      />
      <div className="flex flex-1 flex-col px-2 pb-3 pt-3">
        <ul className="flex flex-col gap-0.5">
          {inbox.items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href as Route}
                className="group flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 transition-colors hover:bg-row-wash"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-card-inset text-near-ink">
                  <FileCheck className="size-4" strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={item.title}>{item.title}</p>
                  <p className="truncate text-xs text-soft-ink" title={item.subtitle}>{item.subtitle}</p>
                </div>
                <Badge variant={item.ageDays > 3 ? "warning" : "neutral"} className="shrink-0">
                  {waitingLabel(item.ageDays)}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
        {inbox.total > inbox.items.length ? (
          <Link
            href="/dashboard/jobs"
            className="mx-3 mt-1 rounded-[var(--radius-md)] px-3 py-2.5 text-center text-xs font-medium text-soft-ink transition hover:bg-row-wash"
          >
            {inbox.total - inbox.items.length} more in Jobs
          </Link>
        ) : null}
      </div>
    </Tile>
  );
}
