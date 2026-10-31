import type { ReactNode, SVGProps } from "react"

import { cn } from "@/lib/utils"

/**
 * Spot illustrations: a soft lime-wash blob with an ink line icon and one lime
 * accent, in the spirit of Deel's empty and success moments. They only use
 * theme tokens (lime-wash, near-ink, chartreuse-signal, card), so dark mode
 * follows without any per-theme assets. Decorative: aria-hidden by default.
 */
type SpotProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number }

const BLOB =
  "M48 7C64 6 84 15 88 33c4 17-4 25-3 38-1 12-16 20-35 19C32 90 12 82 8 64 5 49 14 42 15 30 17 17 32 8 48 7Z"

function Spot({
  size = 96,
  className,
  children,
  ...props
}: SpotProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0 text-near-ink", className)}
      {...props}
    >
      <path d={BLOB} fill="var(--lime-wash)" />
      <circle cx="82" cy="18" r="3" fill="var(--chartreuse-signal)" />
      <circle cx="12" cy="76" r="2" fill="var(--chartreuse-signal)" />
      <g
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </g>
    </svg>
  )
}

export function SpotSuccess(props: SpotProps) {
  return (
    <Spot {...props}>
      <circle cx="48" cy="48" r="20" fill="var(--chartreuse-signal)" />
      <path d="m39 49 7 7 13-15" />
    </Spot>
  )
}

export function SpotEmpty(props: SpotProps) {
  return (
    <Spot {...props}>
      <path
        d="M30 38a3 3 0 0 1 3-3h10l5 6h15a3 3 0 0 1 3 3v21a3 3 0 0 1-3 3H33a3 3 0 0 1-3-3V38Z"
        fill="var(--pure-snow)"
      />
      <path d="M30 47h36" />
      <path d="M42 57h12" stroke="var(--quiet-mist)" />
    </Spot>
  )
}

export function SpotInfo(props: SpotProps) {
  return (
    <Spot {...props}>
      <circle cx="48" cy="48" r="20" fill="var(--pure-snow)" />
      <path d="M48 47v11" />
      <circle cx="48" cy="39" r="1.5" fill="currentColor" />
    </Spot>
  )
}

export function SpotWarning(props: SpotProps) {
  return (
    <Spot {...props}>
      <path
        d="M46.3 31.5a2 2 0 0 1 3.4 0l17 29A2 2 0 0 1 65 63.5H31a2 2 0 0 1-1.7-3l17-29Z"
        fill="var(--pure-snow)"
      />
      <path d="M48 42v10" />
      <circle cx="48" cy="57" r="1.5" fill="currentColor" />
    </Spot>
  )
}

export function SpotTrash(props: SpotProps) {
  return (
    <Spot {...props}>
      <path d="M33 38h30l-2.2 22a3 3 0 0 1-3 2.7H38.2a3 3 0 0 1-3-2.7L33 38Z" fill="var(--pure-snow)" />
      <path d="M30 38h36" />
      <path d="M43 38v-4a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 53 34v4" />
      <path d="M43 45v11M53 45v11" stroke="var(--quiet-mist)" />
    </Spot>
  )
}

/**
 * The blob with any icon drawn inside it. Used by EmptyState so screens that
 * already pass a Lucide/Phosphor glyph get the spot-illustration look.
 */
export function SpotIcon({
  icon: Icon,
  size = 80,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>
  size?: number
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={cn("relative inline-flex shrink-0 items-center justify-center text-near-ink", className)}
    >
      <svg viewBox="0 0 96 96" className="absolute inset-0 size-full" fill="none" focusable="false">
        <path d={BLOB} fill="var(--lime-wash)" />
        <circle cx="82" cy="18" r="3" fill="var(--chartreuse-signal)" />
        <circle cx="12" cy="76" r="2" fill="var(--chartreuse-signal)" />
      </svg>
      <Icon className="relative size-[30%]" />
    </span>
  )
}
