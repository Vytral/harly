import { type SVGProps } from "react";

/**
 * Builder-specific chrome glyphs still in active use (move-step and
 * remove-step controls in ActionsPanel). Everything else that used to live
 * here (step-kind markers, connectors, drag handle, etc.) had no importer
 * anywhere in the app and was removed rather than kept as speculative API.
 * New icon needs in this feature should reach for lucide-react first.
 */

type IconProps = SVGProps<SVGSVGElement>;

/** Chevron up — move-step-up control. */
export function ChevronUpIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6 15l6-6 6 6" />
    </svg>
  );
}

/** Chevron down — move-step-down control. */
export function ChevronDownIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/** Small close glyph — remove-step control. */
export function CloseIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
