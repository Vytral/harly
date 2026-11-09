"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";

import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { isNavActive, type NavItem } from "@/components/dashboard/nav-items";

/**
 * Secondary navigation under the header pills: the section's name on the left
 * and its icon + label links centred under the pills (Deel's "People / Org
 * chart / Time off" row). Active item takes a soft ink-tinted fill, so it reads
 * on the lime wash in light and dark. On phones the title drops and the links
 * scroll horizontally instead of wrapping.
 */
export function SubNav({
  label,
  icon: SectionIcon,
  items,
  pathname,
  counts,
}: {
  label: string;
  icon?: NavItem["icon"];
  items: NavItem[];
  pathname: string;
  counts: Record<string, number>;
}) {
  const t = useTranslations("shell.nav");
  const reduceMotion = useReducedMotion();
  return (
    <div className="grid h-12 grid-cols-[minmax(0,1fr)] items-center px-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-4 md:px-5">
      <p className="hidden min-w-0 items-center gap-2 truncate text-[15px] font-semibold tracking-[-0.01em] text-near-ink md:flex">
        {SectionIcon ? (
          <SectionIcon className="size-4 shrink-0 text-soft-ink" strokeWidth={1.8} />
        ) : null}
        {label}
      </p>
    <nav
      aria-label={t("sections", { label })}
      className="scrollbar-hide flex min-w-0 items-center gap-1 overflow-x-auto"
    >
      {/* One group per section so the pill never flies between sections. */}
      <LayoutGroup id={`subnav-${label}`}>
      {items.map((item) => {
        const Icon = item.icon;
        const active = isNavActive(pathname, item);
        const count = item.badge ? (counts[item.badge] ?? 0) : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-2.5 text-[13.5px] font-medium transition-colors duration-150 ease-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink",
              active
                ? "text-near-ink"
                : "text-soft-ink hover:bg-near-ink/[0.04] hover:text-near-ink",
            )}
          >
            {active ? (
              <motion.span
                layoutId="subnav-active-pill"
                aria-hidden="true"
                transition={reduceMotion ? { duration: 0 } : spring.pill}
                className="absolute inset-0 rounded-md bg-near-ink/[0.07]"
              />
            ) : null}
            <Icon className="relative size-4 shrink-0" strokeWidth={1.8} />
            <span className="relative">{t(item.messageKey)}</span>
            {count > 0 ? (
              <span className="font-chrome relative rounded-full bg-chartreuse-signal px-1.5 text-[11px] leading-[17px] text-chartreuse-ink">
                {count > 99 ? "99+" : count}
              </span>
            ) : null}
          </Link>
        );
      })}
      </LayoutGroup>
    </nav>
      {/* Mirrors the title column so the links sit on the true centre line. */}
      <span aria-hidden="true" className="hidden md:block" />
    </div>
  );
}
