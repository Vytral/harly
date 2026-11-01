import Link from "next/link";
import type { Route } from "next";
import { TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { RiskJob } from "@/features/dashboard/widgets";
import { Tile, TileHeader, TileLink, EmptyHint } from "./primitives";

const severityVariant: Record<
  RiskJob["severity"],
  "danger" | "warning"
> = {
  critical: "danger",
  danger: "danger",
  warning: "warning",
};

const severityLabel: Record<RiskJob["severity"], string> = {
  critical: "Critical",
  danger: "At risk",
  warning: "Needs attention",
};

export function JobsAtRisk({
  jobs,
  className,
}: {
  jobs: RiskJob[];
  className?: string;
}) {
  return (
    <Tile className={className}>
      <TileHeader
        icon={TriangleAlert}
        title="Jobs at risk"
        action={<TileLink href="/dashboard/jobs">View all</TileLink>}
      />
      <div className="flex flex-1 flex-col px-2 pb-3 pt-3">
        {jobs.length > 0 ? (
          <ul className="flex-1 flex flex-col gap-0.5">
            {jobs.map((job) => (
              <li key={job.id}>
                <Link
                  href={`/dashboard/jobs/${job.id}` as Route}
                  className="group flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 transition-colors hover:bg-row-wash"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{job.title}</p>
                    <p className="truncate text-xs text-soft-ink">
                      {job.reason}
                    </p>
                  </div>
                  <Badge
                    variant={severityVariant[job.severity]}
                    className="shrink-0"
                  >
                    {severityLabel[job.severity]}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyHint
            icon={TriangleAlert}
            text="Every open role is on track. Nice work."
          />
        )}
      </div>
    </Tile>
  );
}
