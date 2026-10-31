import type { Route } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

type PagerLink = { href: string; name: string } | null;

/**
 * Always-visible prev/next navigation next to "Back", walking the list the
 * page was opened from (review queue, filtered directory, pipeline). Links,
 * so they are keyboard reachable, prefetched and open in a new tab.
 */
export function CandidatePager({
  prev,
  next,
  position,
  total,
  label,
  plain = false,
}: {
  prev: PagerLink;
  next: PagerLink;
  /** 1-based; null when the candidate is not in that list (any more). */
  position: number | null;
  total: number;
  /** The origin list, e.g. "Review queue". */
  label: string;
  /** The unfiltered directory reads "Candidate 3 of 20". */
  plain?: boolean;
}) {
  if (total === 0 && !next) return null;

  const status =
    position === null
      ? `Not in ${label} · ${total} left`
      : plain
        ? `Candidate ${position} of ${total}`
        : `${position} of ${total} in ${label}`;

  return (
    <nav aria-label={`${label} navigation`} className="flex items-center gap-1 text-sm text-muted-foreground">
      <PagerButton link={prev} direction="prev" />
      <span className="tabular-nums" aria-live="polite">
        {status}
      </span>
      <PagerButton link={next} direction="next" />
    </nav>
  );
}

function PagerButton({ link, direction }: { link: PagerLink; direction: "prev" | "next" }) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  const fallback = direction === "prev" ? "Previous candidate" : "Next candidate";
  const label = link ? `${fallback}: ${link.name}` : fallback;

  if (!link) {
    return (
      <Button size="sm" variant="ghost" className="size-8 p-0 disabled:opacity-30" disabled aria-label={fallback}>
        <Icon className="size-4" />
      </Button>
    );
  }
  return (
    <Button asChild size="sm" variant="ghost" className="size-8 p-0">
      <Link href={link.href as Route} aria-label={label} title={label}>
        <Icon className="size-4" />
      </Link>
    </Button>
  );
}
