"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export type EditorRailSection = { key: string; label: string };

/** Scrollspy section nav , replaces the old numbered step stepper. No gating:
 *  every section is always mounted, this just tracks/jumps within the scroll. */
export function JobEditorRail({
  sections,
  scrollRootRef,
}: {
  sections: EditorRailSection[];
  scrollRootRef: React.RefObject<HTMLElement | null>;
}) {
  const [active, setActive] = useState(sections[0]?.key ?? "");

  useEffect(() => {
    const root = scrollRootRef.current;
    if (!root) return;
    const els = sections
      .map((s) => document.getElementById(s.key))
      .filter((el): el is HTMLElement => Boolean(el));
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { root, rootMargin: "-10% 0px -70% 0px", threshold: 0 },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections, scrollRootRef]);

  function go(key: string) {
    document.getElementById(key)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <nav
        aria-label="Job sections"
        className="hidden w-48 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border bg-paper px-3 py-4 md:flex"
      >
        {sections.map((s) => {
          const isActive = active === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => go(s.key)}
              aria-current={isActive ? "true" : undefined}
              className={cn(
                "group relative rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors duration-150",
                isActive ? "bg-sage/70 text-pine" : "text-ink-soft hover:bg-kraft hover:text-foreground",
              )}
            >
              {isActive ? (
                <span className="absolute inset-y-1.5 -left-0.5 w-[3px] rounded-full bg-pine" />
              ) : null}
              {s.label}
            </button>
          );
        })}
      </nav>

      <nav
        aria-label="Job sections"
        className="sticky top-0 z-10 flex gap-1.5 overflow-x-auto border-b border-border bg-paper px-3 py-2 md:hidden"
      >
        {sections.map((s) => {
          const isActive = active === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => go(s.key)}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-150",
                isActive ? "bg-sage text-pine" : "bg-kraft/60 text-ink-soft",
              )}
            >
              {s.label}
            </button>
          );
        })}
      </nav>
    </>
  );
}
