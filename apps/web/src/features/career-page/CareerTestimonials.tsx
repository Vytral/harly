"use client";

import { useRef } from "react";

import { cn } from "@/lib/utils";

import type { CareerTestimonial } from "./config";
import { safeImageUrl } from "./config";

// Stable initial-circle palette (no lucide "egg" avatars — coloured monograms).
const AVATAR_TINT = [
  { bg: "#FDE68A", fg: "#92400E" },
  { bg: "#BFDBFE", fg: "#1E3A8A" },
  { bg: "#FBCFE8", fg: "#9D174D" },
  { bg: "#A7F3D0", fg: "#065F46" },
  { bg: "#DDD6FE", fg: "#5B21B6" },
  { bg: "#FED7AA", fg: "#9A3412" },
];

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

function Card({ t, i, accent }: { t: CareerTestimonial; i: number; accent: string }) {
  const tint = AVATAR_TINT[i % AVATAR_TINT.length];
  const avatarUrl = safeImageUrl(t.avatar);
  return (
    <figure
      className="flex w-80 shrink-0 flex-col justify-between rounded-3xl border border-zinc-200 bg-white/80 p-6 shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-1 motion-reduce:transition-none dark:border-zinc-800 dark:bg-zinc-900/60"
    >
      <span className="text-4xl leading-none" style={{ color: accent }} aria-hidden>
        &ldquo;
      </span>
      <blockquote className="mt-2 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
        {t.quote}
      </blockquote>
      <figcaption className="mt-5 flex items-center gap-3">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={t.name}
            className="size-10 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
            style={{ backgroundColor: tint.bg, color: tint.fg }}
          >
            {initials(t.name) || "?"}
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {t.name}
          </span>
          {t.role && (
            <span className="block truncate text-sm text-zinc-500 dark:text-zinc-400">
              {t.role}
            </span>
          )}
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * Testimonials carousel. Rounded cards on a seamless CSS marquee (duplicated
 * track, linear, transform-only → runs off the main thread), pausing on hover.
 * Also drag-to-scroll on the same strip for manual control. With
 * prefers-reduced-motion the marquee stops and it falls back to a static,
 * wrapping grid so nothing moves.
 */
export function CareerTestimonials({
  items,
  accent,
}: {
  items: CareerTestimonial[];
  accent: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ down: false, startX: 0, startScroll: 0, moved: false });

  if (items.length === 0) return null;

  // Marquee only makes sense with enough cards to fill the strip; otherwise a
  // centered row reads better and avoids a near-empty looping animation.
  const marquee = items.length >= 3;

  function onPointerDown(e: React.PointerEvent) {
    const el = trackRef.current;
    if (!el) return;
    drag.current = { down: true, startX: e.clientX, startScroll: el.scrollLeft, moved: false };
    el.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    const el = trackRef.current;
    if (!el || !drag.current.down) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > 3) drag.current.moved = true;
    el.scrollLeft = drag.current.startScroll - dx;
  }
  function endDrag(e: React.PointerEvent) {
    const el = trackRef.current;
    drag.current.down = false;
    el?.releasePointerCapture(e.pointerId);
  }

  if (marquee) {
    // Two copies of the list → translateX 0 → -50% loops with no visible seam.
    const loop = [...items, ...items];
    return (
      <div
        className="group relative -mx-6 overflow-hidden px-6 [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]"
      >
        <div
          className="flex w-max gap-5 career-marquee-slow"
        >
          {loop.map((t, i) => (
            <Card key={`${i}-${t.name}`} t={t} i={i % items.length} accent={accent} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={trackRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={cn(
        "flex gap-5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "cursor-grab touch-pan-y snap-x snap-mandatory active:cursor-grabbing",
        "motion-reduce:flex-wrap",
      )}
    >
      {items.map((t, i) => (
        <div key={i} className="snap-start">
          <Card t={t} i={i} accent={accent} />
        </div>
      ))}
    </div>
  );
}
