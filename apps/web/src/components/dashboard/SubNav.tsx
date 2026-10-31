"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";
import { isNavActive, type NavItem } from "@/components/dashboard/nav-items";

/**
 * Secondary navigation under the header pills: icon + label links for the
 * active group (Deel's "People / Org chart / Time off" row). Active item takes
 * a soft ink-tinted fill, so it reads on the lime wash in light and dark.
 * Scrolls horizontally on narrow screens instead of wrapping.
 */
export function SubNav({
  label,
  items,
  pathname,
  counts,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
  counts: Record<string, number>;
}) {
  return (
    <nav
      aria-label={`${label} sections`}
      className="scrollbar-hide flex h-12 items-center gap-1 overflow-x-auto px-3 md:px-5"
    >
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
              "inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-2.5 text-[13.5px] font-medium transition-colors duration-150 ease-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink",
              active
                ? "bg-near-ink/[0.07] text-near-ink"
                : "text-soft-ink hover:bg-near-ink/[0.04] hover:text-near-ink",
            )}
          >
            <Icon className="size-4 shrink-0" strokeWidth={1.8} />
            {item.label}
            {count > 0 ? (
              <span className="font-chrome rounded-full bg-chartreuse-signal px-1.5 text-[11px] leading-[17px] text-chartreuse-ink">
                {count > 99 ? "99+" : count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
