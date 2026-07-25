"use client";

import Link from "next/link";
import type { Route } from "next";

import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/UserAvatar";

/**
 * The locked primitives of Harly's hero surface (DESIGN.md , Components).
 *
 * Read off `referencias/01-hero-human-table.webp`. Every rule here is a value
 * from that frame, not a preference:
 *   - selection is a filled soft row block with its own radius, never a border
 *   - status pills are cool-grey and silent; only taxonomy tags carry weight
 *   - column headers are 12px variable-face, letterspaced, soft ink
 *   - avatars are photographs: 36px in rows, 24px in stacks
 *
 * These live in ui/ rather than the dashboard feature because the pipeline,
 * inbox and jobs surfaces all inherit them , one density language, repeated
 * with discipline, is the whole point.
 */

/* ── Table shell ─────────────────────────────────────────────────────────── */

export function HumanTable({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table className="w-full border-separate border-spacing-y-1 text-left">
        {children}
      </table>
    </div>
  );
}

export function HumanTableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr>{children}</tr>
    </thead>
  );
}

/** No border under the header , spacing does the separating (frame 01). */
export function Th({
  children,
  className,
  srOnly,
}: {
  children: React.ReactNode;
  className?: string;
  srOnly?: boolean;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "type-col-head px-4 pb-2 font-normal uppercase",
        srOnly && "sr-only",
        className,
      )}
    >
      {children}
    </th>
  );
}

/**
 * A row. Selection paints the whole row , including the trailing action cell ,
 * with row wash and rounds the outer corners, exactly as the frame does.
 */
export function Tr({
  selected,
  children,
}: {
  selected?: boolean;
  children: React.ReactNode;
}) {
  return (
    <tr
      data-selected={selected ? "true" : undefined}
      className={cn(
        "group/row transition-colors",
        "[&>td]:h-[var(--spacing-row)] [&>td]:bg-transparent [&>td]:align-middle",
        "[&>td:first-child]:rounded-l-[var(--radius-row)] [&>td:last-child]:rounded-r-[var(--radius-row)]",
        selected
          ? "[&>td]:bg-row-wash"
          : "hover:[&>td]:bg-row-wash/60",
      )}
    >
      {children}
    </tr>
  );
}

export function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={cn("px-4", className)}>{children}</td>;
}

/* ── Person cell ─────────────────────────────────────────────────────────── */

export function PersonCell({
  name,
  avatarUrl,
  href,
  secondary,
}: {
  name: string;
  avatarUrl: string | null;
  href?: Route;
  secondary?: string;
}) {
  const body = (
    <span className="flex min-w-0 items-center gap-3">
      <UserAvatar name={name} src={avatarUrl} size="md" className="shrink-0" />
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-medium leading-tight text-near-ink">
          {name}
        </span>
        {secondary ? (
          <span className="mt-0.5 block truncate text-[12px] leading-tight text-soft-ink">
            {secondary}
          </span>
        ) : null}
      </span>
    </span>
  );

  if (!href) return body;
  return (
    <Link
      href={href}
      className="-mx-1 flex rounded-[10px] px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
    >
      {body}
    </Link>
  );
}

/* ── Status pill ─────────────────────────────────────────────────────────── */

export type StatusTone = "quiet" | "success" | "danger" | "warning";

const statusTones: Record<StatusTone, string> = {
  quiet: "bg-status-quiet text-status-quiet-ink",
  success: "bg-sage-wash text-success-olive",
  danger: "bg-danger-rust/10 text-danger-rust",
  warning: "bg-warning-clay/10 text-warning-clay",
};

/**
 * State without drama. Quiet by default , the frame's `Pending` pill is a cool
 * grey-blue, not a colour-coded rainbow. Semantic tones exist for hired and
 * rejected only. Never chartreuse: that is reserved for live signals.
 */
export function StatusPill({
  children,
  tone = "quiet",
  className,
}: {
  children: React.ReactNode;
  tone?: StatusTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-chrome inline-flex items-center rounded-full px-2.5 py-1 text-[12px] leading-none",
        statusTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ── Category chip ───────────────────────────────────────────────────────── */

/**
 * Sparse taxonomy. Two weights only, matching the frame: solid ink for heavy
 * tags (`Product`) and chartreuse for signal tags (`Tech`). Which one a given
 * value gets is deterministic, so the same department never changes weight
 * between screens.
 */
export function CategoryChip({
  children,
  tone,
  className,
}: {
  children: React.ReactNode;
  tone?: "ink" | "signal";
  className?: string;
}) {
  const label = typeof children === "string" ? children : "";
  const resolved = tone ?? (isSignalCategory(label) ? "signal" : "ink");

  return (
    <span
      className={cn(
        "font-chrome inline-flex items-center rounded-full px-2 py-0.5 text-[12px] leading-[18px]",
        resolved === "signal"
          ? "bg-chartreuse-signal text-chartreuse-ink"
          : "bg-tag-solid text-pure-snow dark:text-warm-paper",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Engineering-adjacent departments read as the "live" track in a hiring tool,
 * which is what the frame gives chartreuse (`Tech`) versus solid ink
 * (`Product`). Keeping the mapping here means it is one decision, not a prop
 * every caller guesses at.
 */
const SIGNAL_CATEGORIES = [
  "tech",
  "technology",
  "engineering",
  "eng",
  "data",
  "infrastructure",
  "platform",
];

function isSignalCategory(label: string) {
  return SIGNAL_CATEGORIES.includes(label.trim().toLowerCase());
}

/* ── Team avatar stack ───────────────────────────────────────────────────── */

/** Max three faces plus a count, each ringed in pure snow (frame 01). */
export function AvatarStack({
  people,
  max = 3,
}: {
  people: { id: string; name: string; image: string | null }[];
  max?: number;
}) {
  if (people.length === 0) {
    return <span className="text-[13px] text-quiet-mist">—</span>;
  }

  const shown = people.slice(0, max);
  const overflow = people.length - shown.length;

  return (
    <span className="flex items-center">
      {shown.map((person, index) => (
        <span
          key={person.id}
          className={cn("rounded-full ring-2 ring-pure-snow", index > 0 && "-ml-2")}
          title={person.name}
        >
          <UserAvatar name={person.name} src={person.image} size="sm" />
        </span>
      ))}
      {overflow > 0 ? (
        <span className="font-chrome -ml-2 flex size-7 items-center justify-center rounded-full bg-soft-kraft text-[11px] text-soft-ink ring-2 ring-pure-snow">
          +{overflow}
        </span>
      ) : null}
      <span className="sr-only">
        {people.map((person) => person.name).join(", ")}
      </span>
    </span>
  );
}

/* ── Checkbox ────────────────────────────────────────────────────────────── */

/** Soft rounded-sm box; checked is an ink fill, as in the frame. */
export function RowCheckbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          "flex size-[18px] items-center justify-center rounded-[6px] border transition-colors",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-near-ink peer-focus-visible:ring-offset-2",
          checked
            ? "border-near-ink bg-near-ink text-pure-snow"
            : "border-mist-border bg-pure-snow",
        )}
      >
        {checked ? (
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : null}
      </span>
      <span className="sr-only">{label}</span>
    </label>
  );
}
