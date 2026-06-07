import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, ClipboardCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { cn } from "@/lib/utils";
import type { ReviewCandidate } from "@/features/dashboard/widgets";
import { Tile, TileHeader, TileLink, EmptyHint } from "./primitives";

function agingLabel(days: number) {
  if (days <= 0) return "Requested today";
  return `Requested ${days} day${days === 1 ? "" : "s"} ago`;
}

export function CandidatesNeedingReview({
  candidates,
  className,
}: {
  candidates: ReviewCandidate[];
  className?: string;
}) {
  return (
    <Tile className={className}>
      <TileHeader
        icon={ClipboardCheck}
        title="Candidates needing your review"
        action={<TileLink href="/dashboard/candidates">View all</TileLink>}
      />
      <div className="flex flex-1 flex-col px-2 pb-2 pt-1">
        {candidates.length > 0 ? (
          <ul className="flex-1 divide-y divide-border/60">
            {candidates.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/dashboard/candidates/${c.candidateId}` as Route}
                  className="group flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-muted/60"
                >
                  <UserAvatar name={c.name} size="sm" />
                  <div className="min-w-0 flex-[1.3]">
                    <p className="truncate text-sm font-medium" title={c.name}>{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground" title={c.job}>{c.job}</p>
                  </div>
                  <Badge variant="secondary" className="hidden shrink-0 sm:inline-flex">
                    {c.stage}
                  </Badge>
                  <div className="hidden w-36 shrink-0 text-right md:block">
                    <p className="truncate text-sm font-medium">{c.action}</p>
                    <p
                      className={cn(
                        "truncate text-xs",
                        c.ageDays > 3
                          ? "text-destructive"
                          : "text-muted-foreground",
                      )}
                    >
                      {agingLabel(c.ageDays)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 max-md:hidden"
                    asChild
                  >
                    <span>
                      Review
                      <ArrowRight className="size-3.5" strokeWidth={1.8} />
                    </span>
                  </Button>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyHint
            icon={ClipboardCheck}
            text="No reviews pending. Your team is on top of feedback."
          />
        )}
      </div>
    </Tile>
  );
}
