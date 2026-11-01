"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState, type ReactNode } from "react";
import { Search, SlidersHorizontal } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { FILTER_ALL } from "@/components/ui/FilterPill";
import { cn } from "@/lib/utils";

/**
 * Shared chrome for the People section directories (Candidates, Talent Pool,
 * Team): the Deel "people table" language. A title row, one white card holding
 * a pill filter bar, a quiet total line and the table, and a floating ink bar
 * for bulk actions. Presentation only; each list keeps its own data and logic.
 */

/* ── Page title row ──────────────────────────────────────────────────────── */

export function PageTitleRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  /** Actions, rendered on the right (primary ink first, outline after). */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="font-display text-[28px] leading-9 tracking-tight text-near-ink">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-soft-ink">{description}</p>
        ) : null}
      </div>
      {children ? (
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      ) : null}
    </div>
  );
}

/* ── Tabs (All / Trash) ──────────────────────────────────────────────────── */

export type DirectoryTab = {
  href: string;
  label: string;
  count?: number;
  icon?: ReactNode;
  active: boolean;
};

/** Deel-style underline tabs. Navigation links, so `aria-current` not tablist. */
export function DirectoryTabs({
  items,
  label,
}: {
  items: DirectoryTab[];
  label: string;
}) {
  return (
    <nav aria-label={label} className="scrollbar-hide flex gap-6 border-b border-hairline max-sm:overflow-x-auto">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href as Route}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "relative -mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm pb-3 max-sm:mb-0 text-[14px] font-medium outline-none transition-colors",
            "focus-visible:ring-2 focus-visible:ring-near-ink focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "after:absolute after:inset-x-0 after:-bottom-px max-sm:after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors",
            item.active
              ? "text-near-ink after:bg-near-ink"
              : "text-soft-ink after:bg-transparent hover:text-near-ink",
          )}
        >
          {item.icon}
          {item.label}
          {item.count !== undefined ? (
            <span className="tabular-nums text-quiet-mist">{item.count}</span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

/* ── Card + bars ─────────────────────────────────────────────────────────── */

/** The one white card that holds filter bar, total line and table. */
export function DirectoryCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn("gap-0 overflow-hidden py-0", className)}>
      {children}
    </Card>
  );
}

export function FilterBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Filters"
      className={cn(
        "relative flex flex-wrap items-center gap-2 px-5 py-4",
        // Phones: one swipeable row instead of four stacked rows of chips.
        "scrollbar-hide max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:[&>*]:shrink-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function TotalLine({
  total,
  noun,
  pluralNoun,
  trailing,
}: {
  total: number;
  noun: string;
  pluralNoun?: string;
  trailing?: ReactNode;
}) {
  const plural = pluralNoun ?? `${noun}s`;
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 border-t border-hairline px-5 py-3 text-[13px] text-soft-ink">
      <p aria-live="polite">
        Total{" "}
        <span className="font-medium tabular-nums text-near-ink">
          {total.toLocaleString()}
        </span>{" "}
        {total === 1 ? noun : plural}
      </p>
      {trailing}
    </div>
  );
}

/* ── Filter chips ────────────────────────────────────────────────────────── */

const chipBase =
  "h-9 gap-1.5 rounded-full border border-mist-border bg-card px-3.5 text-[13px] font-medium text-near-ink shadow-none hover:border-soft-ink/50 hover:bg-card-inset focus-visible:ring-near-ink/30 dark:bg-card dark:hover:bg-card-inset";

/** Round search field in the filter bar. */
export function SearchPill({
  value,
  onChange,
  onSubmit,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("relative w-full sm:w-64", className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-soft-ink"
      />
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onSubmit?.();
        }}
        placeholder={placeholder}
        aria-label={label}
        className="h-9 rounded-full border-mist-border bg-card pl-10 text-base shadow-none sm:text-[13px]"
      />
    </div>
  );
}

/**
 * Filter-icon pill with the active-filter count. It clears the filters when
 * there are any (disabled otherwise), so it is never a dead control.
 */
export function FilterCountButton({
  count,
  onClear,
}: {
  count: number;
  onClear: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClear}
      disabled={count === 0}
      aria-label={
        count === 0
          ? "No active filters"
          : `Clear ${count} active filter${count === 1 ? "" : "s"}`
      }
      title={count === 0 ? undefined : "Clear filters"}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border bg-card px-3 text-[13px] font-medium outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-near-ink focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        count > 0
          ? "border-near-ink text-near-ink hover:bg-card-inset"
          : "cursor-default border-mist-border text-soft-ink",
      )}
    >
      <SlidersHorizontal aria-hidden className="size-4" />
      {count > 0 ? <CountBadge>{count}</CountBadge> : null}
    </button>
  );
}

function CountBadge({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-near-ink px-1 text-[11px] font-semibold tabular-nums text-pure-snow"
    >
      {children}
    </span>
  );
}

/**
 * Dropdown chip: "Department ▾". Inactive is a hairline pill; active gets an
 * ink outline and a count badge (single-select, so "1"). `showValue` is for
 * chips that always carry a value, like sort.
 */
export function FilterChip({
  label,
  value,
  onChange,
  options,
  labelMap,
  allValue,
  showValue = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  labelMap?: Record<string, string>;
  /** Neutral option value. Omit to inject an "All" item (FILTER_ALL). */
  allValue?: string;
  showValue?: boolean;
}) {
  const neutral = allValue ?? FILTER_ALL;
  const active = value !== neutral;
  const display = value === FILTER_ALL ? "All" : (labelMap?.[value] ?? value);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        size="sm"
        title={active && !showValue ? display : undefined}
        className={cn(chipBase, "w-auto", active && !showValue && "border-near-ink")}
      >
        <span>{label}</span>
        {showValue ? (
          <span className="max-w-32 truncate text-soft-ink">{display}</span>
        ) : active ? (
          <>
            <CountBadge>1</CountBadge>
            <span className="sr-only">: {display}</span>
          </>
        ) : null}
      </SelectTrigger>
      <SelectContent position="popper" align="start" className="max-h-60">
        {allValue === undefined ? <SelectItem value={FILTER_ALL}>All</SelectItem> : null}
        {options.map((opt) => (
          <SelectItem key={opt} value={opt}>
            {labelMap?.[opt] ?? opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/* ── Table class tokens ──────────────────────────────────────────────────── */

export const dirTable = "w-full min-w-[640px] border-collapse text-left text-[14px]";
export const dirTh =
  "h-11 whitespace-nowrap bg-card-inset px-4 text-left text-[12.5px] font-medium text-soft-ink first:pl-5 last:pr-5";
export const dirTr =
  "group/row h-[60px] border-t border-hairline transition-colors duration-[120ms] hover:bg-row-wash/60 data-[state=selected]:bg-lime-wash";
export const dirTd = "px-4 align-middle first:pl-5 last:pr-5";

/* ── Floating bulk bar ───────────────────────────────────────────────────── */

/**
 * Sticky bottom toolbar, an ink pill that floats over the page while rows are
 * selected. Children are its actions; use `BulkAction` for consistent styling.
 */
export function BulkActionBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: ReactNode;
}) {
  // Keep the bar mounted for the 140ms exit, showing the last real count.
  const [mounted, setMounted] = useState(count > 0);
  const [shownCount, setShownCount] = useState(count);
  if (count > 0 && !mounted) setMounted(true);
  if (count > 0 && count !== shownCount) setShownCount(count);
  useEffect(() => {
    if (count > 0 || !mounted) return;
    const timer = setTimeout(() => setMounted(false), 140);
    return () => clearTimeout(timer);
  }, [count, mounted]);
  if (!mounted) return null;
  const open = count > 0;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <div
        role="toolbar"
        aria-label="Bulk actions"
        data-state={open ? "open" : "closed"}
        className={cn(
          "pointer-events-auto flex max-w-full flex-wrap items-center gap-1 rounded-[28px] bg-near-ink py-1.5 pr-2 pl-4 text-pure-snow shadow-[var(--shadow-float)] ease-out motion-reduce:animate-none",
          open
            ? "animate-in fade-in slide-in-from-bottom-2 duration-200"
            : "pointer-events-none animate-out fade-out slide-out-to-bottom-2 fill-mode-forwards duration-[140ms] motion-reduce:invisible",
        )}
      >
        <span
          className="mr-1 text-[13px] font-medium tabular-nums"
          aria-live="polite"
        >
          {shownCount} selected
        </span>
        {children}
        <BulkAction onClick={onClear} aria-label="Clear selection">
          Clear
        </BulkAction>
      </div>
    </div>
  );
}

export function BulkAction({
  className,
  danger,
  ...props
}: React.ComponentProps<"button"> & { danger?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium whitespace-nowrap outline-none transition-colors",
        "hover:bg-pure-snow/15 focus-visible:ring-2 focus-visible:ring-pure-snow/60 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        danger && "text-danger-rust",
        className,
      )}
      {...props}
    />
  );
}
