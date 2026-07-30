import { type SVGProps } from "react";

/**
 * Builder-specific glyphs for the workflow canvas. WHEN / IF / DO step markers,
 * connector arrows, and small chrome icons. Stroke-width matches the career
 * page builder icons (1.5) so the two builders read as one family.
 */

type IconProps = SVGProps<SVGSVGElement>;

/** WHEN — a lightning bolt, the "something happened" trigger marker. */
export function WhenGlyph(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
    </svg>
  );
}

/** IF — a funnel, the "filter / branch" condition marker. */
export function IfGlyph(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 4h18l-7 8v6l-4 2v-8L3 4z" />
    </svg>
  );
}

/** DO — a play/check marker, the "take action" step marker. */
export function DoGlyph(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 8l8 4-8 4V8z" />
    </svg>
  );
}

/** Vertical connector — a dashed line between two canvas steps. */
export function ConnectorDown(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3v14" strokeDasharray="3 3" />
      <path d="M8 13l4 4 4-4" />
    </svg>
  );
}

/** Drag handle for reordering actions. */
export function DragHandleIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <circle cx="9" cy="6" r="1.4" />
      <circle cx="15" cy="6" r="1.4" />
      <circle cx="9" cy="12" r="1.4" />
      <circle cx="15" cy="12" r="1.4" />
      <circle cx="9" cy="18" r="1.4" />
      <circle cx="15" cy="18" r="1.4" />
    </svg>
  );
}

/** Test / dry-run beaker. */
export function BeakerIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 3h6" />
      <path d="M10 3v6L5 19a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-10V3" />
      <path d="M7 15h10" />
    </svg>
  );
}

/** Add-node — a plus inside a dashed circle, for "add condition / action". */
export function AddNodeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </svg>
  );
}

/** AND / OR group badge. */
export function GroupIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="8" rx="2" />
      <rect x="8" y="13" width="8" height="8" rx="2" />
      <path d="M7 11v1a2 2 0 0 0 2 2h0" />
      <path d="M17 11v1a2 2 0 0 1-2 2h0" />
    </svg>
  );
}

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

/** Small filled node dot — the joint marker on a flow connector line. */
export function NodeDotIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 8 8" fill="currentColor" {...props}>
      <circle cx="4" cy="4" r="4" />
    </svg>
  );
}

/** Branch/merge glyph for the AND/OR tree connector rail. */
export function BranchIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="6" cy="18" r="2.2" />
      <circle cx="18" cy="12" r="2.2" />
      <path d="M6 8.2V18M8.2 6H14a4 4 0 0 1 4 4v0" />
    </svg>
  );
}
