"use client";

import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Phone } from "lucide-react";

import { useStickyBar } from "@/components/dashboard/StickyBarContext";
import { UserAvatar } from "@/components/ui/UserAvatar";

type CandidateStickyHeaderProps = {
  name: string;
  avatarUrl: string | null;
  fallbackSrcs?: string[];
  stageName: string | null;
  phone: string | null;
  actions: ReactNode;
  children: ReactNode;
};

export function CandidateStickyHeader({
  name,
  avatarUrl,
  fallbackSrcs,
  stageName,
  phone,
  actions,
  children,
}: CandidateStickyHeaderProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  const [rect, setRect] = useState<{ left: number; width: number } | null>(null);
  const { setStickyBarVisible } = useStickyBar();

  useEffect(() => {
    setStickyBarVisible(pinned);
  }, [pinned, setStickyBarVisible]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setPinned(!entry.isIntersecting),
      { rootMargin: "0px 0px 0px 0px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Track the wrapper's position/width so the fixed bar aligns exactly.
  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setRect({ left: r.left, width: r.width });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", update);
    };
  }, []);

  return (
    <div ref={wrapperRef}>
      <div
        className="fixed top-0 z-40 h-14 transition-all duration-300"
        style={rect ? { left: rect.left, width: rect.width } : { left: 0, width: 0 }}
        aria-hidden={!pinned}
      >
        <div
          className="flex h-14 items-center gap-3 overflow-hidden rounded-b-xl border border-t-0 border-border/70 bg-background/90 px-3 shadow-md backdrop-blur-md transition-[opacity,transform] duration-300 sm:px-4"
          style={{
            opacity: pinned ? 1 : 0,
            transform: pinned ? "translateY(0)" : "translateY(-100%)",
            pointerEvents: pinned ? "auto" : "none",
          }}
        >
            <UserAvatar name={name} src={avatarUrl} fallbackSrcs={fallbackSrcs} size="sm" />

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

      {children}
      <div ref={sentinelRef} aria-hidden className="h-px" />
    </div>
  );
}
