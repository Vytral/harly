"use client";

import { useContext, useId, useState } from "react";

import { Switch } from "@/components/ui/switch";
import { SegmentedControl, type SegmentedOption } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";

import { ChevronDownIcon } from "../builder-icons";
import { FieldErrorsContext } from "../primitives";

/** Panel heading: title, one-line purpose, optional trailing action. */
export function PanelHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-near-ink">{title}</h2>
        <p className="mt-0.5 text-[13px] leading-snug text-soft-ink">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

/**
 * A settings card. Collapsible; an optional switch in the header turns the
 * whole block on or off on the public page. `unsupported` renders the card
 * as a muted, closed row explaining that the active template ignores it.
 */
export function Group({
  title,
  description,
  enabled,
  onEnabledChange,
  unsupported,
  defaultOpen = false,
  badge,
  errorPrefix,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  enabled?: boolean;
  onEnabledChange?: (v: boolean) => void;
  /** Template label that doesn't render this block. */
  unsupported?: string;
  defaultOpen?: boolean;
  /** Small trailing count / status, e.g. "3 items". */
  badge?: React.ReactNode;
  /** Config path prefix ("faq."); the card opens itself when it holds an error. */
  errorPrefix?: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const errors = useContext(FieldErrorsContext);
  const errorCount = errorPrefix
    ? Object.keys(errors).filter((path) => path.startsWith(errorPrefix)).length
    : 0;
  // A card holding a validation error is always open.
  const isOpen = open || errorCount > 0;
  const bodyId = useId();
  const switchId = useId();

  if (unsupported) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-dashed border-hairline px-4 py-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-soft-ink">{title}</p>
          <p className="text-[12px] text-quiet-mist">Not used by {unsupported}</p>
        </div>
      </div>
    );
  }

  const hasToggle = onEnabledChange !== undefined;
  const off = hasToggle && !enabled;

  return (
    <section className="overflow-hidden rounded-[var(--radius-card)] bg-pure-snow shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={isOpen}
          aria-controls={bodyId}
          className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
        >
          <ChevronDownIcon
            className={cn(
              "size-4 shrink-0 text-soft-ink transition-transform duration-200 motion-reduce:transition-none",
              !isOpen && "-rotate-90",
            )}
          />
          <span className="min-w-0">
            <span className={cn("block text-[14px] font-semibold text-near-ink", off && "text-soft-ink")}>
              {title}
            </span>
            {description ? (
              <span className="block truncate text-[12px] text-soft-ink">{description}</span>
            ) : null}
          </span>
        </button>
        {errorCount > 0 ? (
          <span className="shrink-0 rounded-full bg-danger-rust/10 px-2 py-0.5 text-[11px] font-medium text-danger-rust">
            {errorCount} to fix
          </span>
        ) : null}
        {badge ? <span className="shrink-0 text-[12px] tabular-nums text-quiet-mist">{badge}</span> : null}
        {hasToggle ? (
          <>
            <label htmlFor={switchId} className="sr-only">
              Show {title} on the page
            </label>
            <Switch id={switchId} checked={Boolean(enabled)} onCheckedChange={onEnabledChange} />
          </>
        ) : null}
      </div>
      {isOpen ? (
        <div id={bodyId} className={cn("space-y-4 border-t border-hairline px-4 py-4", off && "opacity-70")}>
          {off ? (
            <p className="rounded-[var(--radius-btn)] bg-card-inset px-3 py-2 text-[12px] text-soft-ink">
              Hidden on the page. Turn it on to publish this section.
            </p>
          ) : null}
          {children}
        </div>
      ) : null}
    </section>
  );
}

/** Lists settings the active template ignores, so nothing vanishes silently. */
export function HiddenNote({ template, items }: { template: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <p className="text-[12px] leading-snug text-quiet-mist">
      Not used by {template}: {items.join(", ")}.
    </p>
  );
}

/** Field-labelled segmented control (radiogroup semantics from ui/). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <span className="block text-[13px] font-medium leading-5 text-near-ink">{label}</span>
      <SegmentedControl aria-label={label} value={value} options={options} onValueChange={onChange} />
    </div>
  );
}
