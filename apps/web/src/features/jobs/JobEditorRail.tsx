"use client";

import { useEffect, type ReactNode } from "react";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export type EditorRailSection = { key: string; label: string };

/**
 * Stepper card for the job editor: numbered steps, the ones already passed
 * carry an olive check, the current one an ink number. It is a scrollspy, not
 * a gate: every section is always mounted and any step can be jumped to.
 */
export function JobEditorRail({
  sections,
  scrollRootRef,
  active,
  onActiveChange,
  onSelect,
  secondaryActions,
}: {
  sections: EditorRailSection[];
  scrollRootRef: React.RefObject<HTMLElement | null>;
  active: string;
  onActiveChange: (key: string) => void;
  onSelect: (key: string) => void;
  /** View job / Share job / status actions and the hiring progress card. They
   *  live here instead of the top bar, which has no room for them. */
  secondaryActions?: ReactNode;
}) {
  const t = useTranslations("jobs.form");
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
        if (visible[0]) onActiveChange(visible[0].target.id);
      },
      { root, rootMargin: "-10% 0px -70% 0px", threshold: 0 },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections, scrollRootRef, onActiveChange]);

  const activeIndex = Math.max(
    0,
    sections.findIndex((s) => s.key === active),
  );

  return (
    <>
      <aside className="hidden w-64 shrink-0 flex-col gap-3 overflow-y-auto p-4 md:flex">
        <nav
          aria-label={t("jobSections")}
          className="rounded-[var(--radius-card)] bg-card p-4 shadow-[var(--shadow-card)]"
        >
          <p className="mb-3 px-2 text-[15px] font-semibold tracking-[-0.01em] text-near-ink">
            {t("steps")}
          </p>
          <ol className="flex flex-col gap-0.5">
            {sections.map((s, index) => {
              const isActive = index === activeIndex;
              const isDone = index < activeIndex;
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => onSelect(s.key)}
                    aria-current={isActive ? "step" : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[var(--radius-inner)] px-2 py-2 text-left text-[13.5px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink",
                      isActive
                        ? "bg-card-inset font-semibold text-near-ink"
                        : "text-soft-ink hover:bg-card-inset hover:text-near-ink",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums transition-colors",
                        isDone && "bg-success-olive text-pure-snow",
                        isActive && "bg-near-ink text-pure-snow",
                        !isDone && !isActive && "bg-soft-kraft text-soft-ink",
                      )}
                    >
                      {isDone ? <Check className="size-3.5" strokeWidth={3} /> : index + 1}
                    </span>
                    <span className="min-w-0 truncate">{s.label}</span>
                    {isDone ? <span className="sr-only">{t("visited")}</span> : null}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        {secondaryActions ? (
          <div className="flex flex-col gap-1.5">{secondaryActions}</div>
        ) : null}
      </aside>
    </>
  );
}

/**
 * Phone/tablet step chips. Lives inside the editor's scroll column (not beside
 * it) so it sticks to the top of the form instead of becoming a flex sibling
 * that squeezes the form sideways.
 */
export function JobEditorMobileNav({
  sections,
  active,
  onSelect,
}: {
  sections: EditorRailSection[];
  active: string;
  onSelect: (key: string) => void;
}) {
  const t = useTranslations("jobs.form");
  return (
    <nav
      aria-label={t("jobSections")}
      className="scrollbar-hide sticky top-0 z-10 flex shrink-0 gap-1.5 overflow-x-auto bg-background px-3 py-2 md:hidden"
    >
      {sections.map((s, index) => {
        const isActive = s.key === active;
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onSelect(s.key)}
            aria-current={isActive ? "step" : undefined}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink",
              isActive ? "bg-near-ink text-pure-snow" : "bg-soft-kraft text-soft-ink",
            )}
          >
            {index + 1}. {s.label}
          </button>
        );
      })}
    </nav>
  );
}
