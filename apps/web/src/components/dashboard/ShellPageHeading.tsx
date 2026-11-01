"use client";

import { usePathname } from "next/navigation";

import { allNavItems } from "@/components/dashboard/nav-items";
import { usePageTitle } from "@/components/dashboard/PageTitleContext";

/**
 * Page title for routes that don't render their own heading. The old top bar
 * carried the section name as an h1; with the header now holding only
 * navigation, this keeps every page titled. A page can supply a title through
 * `<PageTitle>`; otherwise the leaf nav item flagged `shellTitle` whose href
 * matches the route exactly provides it. Pages that ship their own PageHeader
 * are untouched.
 */
export function ShellPageHeading() {
  const pathname = usePathname();
  const { title: contextTitle } = usePageTitle();

  const navTitle = allNavItems().find(
    (item) => item.shellTitle && item.href === pathname,
  )?.label;
  const title = contextTitle || navTitle;
  if (!title) return null;

  return (
    <h1 className="font-display mb-5 break-words text-2xl sm:text-[28px] leading-9 tracking-tight text-near-ink">
      {title}
    </h1>
  );
}
