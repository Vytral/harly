"use client";

import { useRef, type ComponentType, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A single-choice segmented control with radio-group semantics.
 *
 * Use it for a small, closed set of mutually exclusive options that are shown
 * side by side (type, mode, a two-to-four way toggle). For longer lists or
 * menus, use a Select.
 *
 * Keyboard behaviour follows the WAI-ARIA radio group pattern: the group is one
 * tab stop, arrow keys move and select (wrapping at the ends), and Home and End
 * jump to the first and last enabled option.
 */
export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  icon?: ComponentType<{ className?: string; strokeWidth?: number }>;
  disabled?: boolean;
};

export function SegmentedControl<T extends string>({
  "aria-label": ariaLabel,
  options,
  value,
  onValueChange,
  className,
}: {
  "aria-label": string;
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onValueChange: (value: T) => void;
  className?: string;
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = options.map((option) => !option.disabled);
  const checkedIndex = options.findIndex((option) => option.value === value);
  // Roving tab stop: the checked option, or the first enabled one if nothing
  // matches, so the group is always reachable by keyboard.
  const tabStop = checkedIndex >= 0 ? checkedIndex : enabled.indexOf(true);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = nextEnabledIndex(index, event.key, enabled);
    if (next === null) return;
    event.preventDefault();
    onValueChange(options[next].value);
    buttons.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("grid gap-2", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option, index) => {
        const checked = index === checkedIndex;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            disabled={option.disabled}
            tabIndex={index === tabStop ? 0 : -1}
            onClick={() => onValueChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-[13px] font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "disabled:pointer-events-none disabled:opacity-50",
              checked
                ? "border-primary/40 bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {Icon ? <Icon className="size-4" strokeWidth={1.8} aria-hidden="true" /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Index the arrow, Home or End key moves to, skipping disabled options and
 * wrapping at the ends. Returns null when the key is not a navigation key or no
 * other enabled option exists. Pure, so it is unit tested directly.
 */
export function nextEnabledIndex(
  current: number,
  key: string,
  enabled: ReadonlyArray<boolean>,
): number | null {
  const count = enabled.length;
  if (count === 0) return null;

  if (key === "Home" || key === "End") {
    const order = key === "Home" ? range(0, count) : range(count - 1, -1);
    return order.find((index) => enabled[index]) ?? null;
  }

  let step: number;
  if (key === "ArrowRight" || key === "ArrowDown") step = 1;
  else if (key === "ArrowLeft" || key === "ArrowUp") step = -1;
  else return null;

  for (let offset = 1; offset <= count; offset += 1) {
    const candidate = (((current + step * offset) % count) + count) % count;
    if (enabled[candidate] && candidate !== current) return candidate;
  }
  return null;
}

function range(from: number, to: number) {
  const step = from <= to ? 1 : -1;
  const values: number[] = [];
  for (let value = from; value !== to; value += step) values.push(value);
  return values;
}
