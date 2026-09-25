import { cn } from "@/lib/utils";

/**
 * Shared field styling for the automations builder's hand-rolled
 * <input>/<textarea>/<select> controls that don't go through the shared
 * `Input` component (they need inline sizing per field type). Consolidates
 * ~16 near-identical inline class strings that had drifted (rounded-lg vs
 * rounded-md, focus ring at /30 vs /40, inconsistent surface color).
 *
 * `surface` should contrast with whatever the control sits on: fields inside
 * a pure-snow panel (inspector, dialogs) use "warm-paper" for a visible well;
 * fields directly on the warm-paper canvas use "pure-snow". Defaults to
 * pure-snow, the more common case (fields inside inspector/panel chrome).
 */
export function builderFieldClass(options?: {
  compact?: boolean;
  surface?: "pure-snow" | "warm-paper";
  className?: string;
}) {
  return cn(
    "w-full rounded-lg border border-border text-xs text-foreground outline-none transition-colors duration-150 ease-out focus:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-50",
    (options?.surface ?? "pure-snow") === "pure-snow" ? "bg-pure-snow" : "bg-warm-paper",
    options?.compact ? "h-8 px-2" : "h-9 px-2.5",
    options?.className,
  );
}
