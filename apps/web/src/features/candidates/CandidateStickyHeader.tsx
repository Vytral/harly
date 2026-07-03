"use client";

import type { Route } from "next";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Phone } from "lucide-react";

import { UserAvatar } from "@/components/ui/UserAvatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CandidateStickyHeaderProps = {
  name: string;
  avatarUrl: string | null;
  fallbackSrc: string | null;
  stageName: string | null;
  phone: string | null;
  prevId: string | null;
  nextId: string | null;
  /** Compact action units rendered inside the sticky bar. */
  actions: ReactNode;
  /** The full, expanded header card (server-rendered). */
  children: ReactNode;
};

/**
 * Wraps the candidate header. Once the expanded card scrolls out of view a slim
 * sticky bar drops in under the dashboard TopBar with the identity, pipeline
 * stage, prev/next nav and the fast-path actions — so the recruiter can act
 * without scrolling back up.
 */
export function CandidateStickyHeader({
  name,
  avatarUrl,
  fallbackSrc,
  stageName,
  phone,
  prevId,
  nextId,
  actions,
  children,
}: CandidateStickyHeaderProps) {
  const router = useRouter();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setPinned(!entry.isIntersecting),
      // Trip just as the header clears the TopBar (h-14 = 56px).
      { rootMargin: "-56px 0px 0px 0px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  function go(id: string | null) {
    if (!id) return;
    router.push(`/dashboard/candidates/${id}` as Route);
  }

  return (
    <div className="relative">
      {/* Sticky compact bar — collapses to zero height until pinned. */}
      <div className="sticky top-14 z-30">
        <div
          className={cn(
            "flex items-center gap-3 overflow-hidden rounded-b-xl border-x border-b bg-background/85 px-3 backdrop-blur-md transition-all duration-300 sm:px-4",
            pinned
              ? "h-14 border-border/70 opacity-100 shadow-sm"
              : "pointer-events-none h-0 border-transparent opacity-0",
          )}
        >
          <div className="flex min-w-0 items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="size-8 p-0 text-muted-foreground hover:text-foreground disabled:opacity-30"
              disabled={!prevId}
              onClick={() => go(prevId)}
              title="Previous candidate"
            >
              <ChevronLeft className="size-4" />
              <span className="sr-only">Previous candidate</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="size-8 p-0 text-muted-foreground hover:text-foreground disabled:opacity-30"
              disabled={!nextId}
              onClick={() => go(nextId)}
              title="Next candidate"
            >
              <ChevronRight className="size-4" />
              <span className="sr-only">Next candidate</span>
            </Button>
          </div>

          <UserAvatar name={name} src={avatarUrl ?? fallbackSrc} size="sm" />

          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold">{name}</span>
            {stageName ? (
              <span className="hidden shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground sm:inline">
                {stageName}
              </span>
            ) : null}
            {phone ? (
              <a
                href={`tel:${phone}`}
                className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground lg:inline-flex"
              >
                <Phone className="size-3.5" strokeWidth={1.6} />
                {phone}
              </a>
            ) : null}
          </div>

          <div className="ml-auto shrink-0">{actions}</div>
        </div>
      </div>

      {/* Sentinel sits at the top of the expanded header. */}
      <div ref={sentinelRef} aria-hidden className="absolute inset-x-0 top-0 h-px" />

      {children}
    </div>
  );
}
