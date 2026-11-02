import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Greenhouse-style boxed field: the label sits inside the bordered container,
 * above the value, instead of floating above it. Scoped to the job editor for
 * now , the rest of the app keeps the Label-above-Input convention.
 *
 * Pass `fieldBoxControlClassName` to the child Input/Select/Textarea to strip
 * its own border/background/focus-ring so only this box's chrome shows.
 */
export function FieldBox({
  label,
  htmlFor,
  required,
  hint,
  error,
  action,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div
        className={cn(
          "rounded-[var(--radius-btn)] border border-mist-border bg-pure-snow px-3.5 pt-2 pb-2 transition-[border-color,box-shadow] duration-150 ease-out",
          "focus-within:border-near-ink focus-within:ring-[3px] focus-within:ring-near-ink/10",
          error && "border-danger-rust",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <Label
            htmlFor={htmlFor}
            className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80"
          >
            {label}
            {required ? <span className="text-destructive">*</span> : null}
          </Label>
          {action}
        </div>
        {children}
      </div>
      {error ? (
        <p role="alert" className="text-[12.5px] text-danger-rust">{error}</p>
      ) : hint ? (
        <p className="text-[12.5px] text-soft-ink">{hint}</p>
      ) : null}
    </div>
  );
}

/** Strips Input/Textarea's own chrome so it sits flush inside a FieldBox. */
export const fieldBoxControlClassName =
  "h-auto w-full border-0 bg-transparent p-0 shadow-none text-base md:text-sm focus-visible:ring-0 dark:bg-transparent";

/**
 * Same, for `SelectTrigger`: its height utilities are conditioned on its own
 * `data-size` attribute (`data-[size=default]:h-10`), so the override must
 * repeat the same modifier , tailwind-merge only dedupes within a matching
 * modifier group, a plain `h-auto` would not reliably win against it.
 */
export const fieldBoxSelectTriggerClassName = cn(
  fieldBoxControlClassName,
  "data-[size=default]:h-auto data-[size=sm]:h-auto justify-start gap-1.5",
);
