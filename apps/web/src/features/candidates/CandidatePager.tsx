"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ariaKeys, displayKey, SHORTCUTS } from "@/components/dashboard/shortcuts/catalog";
import { useShortcut } from "@/components/dashboard/shortcuts/useShortcut";

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
  const router = useRouter();
  // J / K walk the same list the buttons do, following the origin queue.
  useShortcut("candidate.next", () => next && router.push(next.href as Route), {
    enabled: Boolean(next),
  });
  useShortcut("candidate.prev", () => prev && router.push(prev.href as Route), {
    enabled: Boolean(prev),
  });

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
  const id = direction === "prev" ? "candidate.prev" : "candidate.next";
  const label = link ? `${fallback}: ${link.name}` : fallback;
  const hinted = `${label} · ${displayKey(SHORTCUTS[id].keys)}`;

  if (!link) {
    return (
      <Button size="sm" variant="ghost" className="size-8 p-0 disabled:opacity-30" disabled aria-label={fallback}>
        <Icon className="size-4" />
      </Button>
    );
  }
  return (
    <Button asChild size="sm" variant="ghost" className="size-8 p-0">
      <Link
        href={link.href as Route}
        aria-label={label}
        aria-keyshortcuts={ariaKeys(id)}
        title={hinted}
      >
        <Icon className="size-4" />
      </Link>
    </Button>
  );
}
