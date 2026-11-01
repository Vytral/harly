"use client";

import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Phone } from "lucide-react";

import { useStickyBar } from "@/components/dashboard/StickyBarContext";
import { Badge } from "@/components/ui/badge";
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

  // Leaving the page while pinned must hand the header back; otherwise the
  // next route inherits a collapsed, click-through app header.
  useEffect(() => () => setStickyBarVisible(false), [setStickyBarVisible]);

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
        className="fixed top-0 z-40 h-12 transition-all duration-150"
        style={rect ? { left: rect.left, width: rect.width } : { left: 0, width: 0 }}
        aria-hidden={!pinned}
        inert={!pinned}
      >
        <div
          className="flex h-12 items-center gap-3 overflow-hidden border-b border-hairline bg-card/90 px-3 backdrop-blur-md supports-[backdrop-filter]:bg-card/75 transition-[opacity,transform] duration-150 sm:px-4"
          style={{
            opacity: pinned ? 1 : 0,
            transform: pinned ? "translateY(0)" : "translateY(-100%)",
            pointerEvents: pinned ? "auto" : "none",
          }}
        >
            <UserAvatar name={name} src={avatarUrl} fallbackSrcs={fallbackSrcs} size="sm" />

            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-semibold text-near-ink">{name}</span>
              {stageName ? (
                <Badge variant="info" className="hidden shrink-0 sm:inline-flex">
                  {stageName}
                </Badge>
              ) : null}
              {phone ? (
                <a
                  href={`tel:${phone}`}
                  className="hidden shrink-0 items-center gap-1 text-xs text-soft-ink hover:text-near-ink lg:inline-flex"
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
