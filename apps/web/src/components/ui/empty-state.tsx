import { cn } from "@/lib/utils";

/**
 * Structural, not family-specific: Lucide and Phosphor glyphs both satisfy it,
 * so a screen keeps whichever family it already speaks.
 */
type EmptyStateIcon = React.ComponentType<{ className?: string }>;

/**
 * The one empty state.
 *
 * An empty state has exactly two jobs: name what would be here, and say what
 * puts it there. Most of ours only did the first , "No notes yet.", "No items
 * yet." , which reads as a dead end and taught the reader nothing. So `hint` is
 * required, not optional: if you cannot say what the next move is, the section
 * probably should not be rendered at all.
 *
 * Two shapes, deliberately: `variant="empty"` for "nothing exists yet" (an
 * invitation), and `variant="filtered"` for "your filters excluded everything"
 * (an escape hatch). Conflating them is why so many screens told a brand-new
 * user their filters were wrong on a database with no rows in it.
 */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  variant = "empty",
  className,
}: {
  icon: EmptyStateIcon;
  title: string;
  hint: string;
  action?: React.ReactNode;
  variant?: "empty" | "filtered";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1.5 px-6 text-center",
        variant === "filtered"
          ? "py-12"
          : "rounded-[var(--radius-lg)] border border-dashed border-mist-border py-10",
        className,
      )}
    >
      <Icon className="size-5 text-quiet-mist" />
      <p className="mt-1 text-[14px] font-medium text-near-ink">{title}</p>
      <p className="max-w-sm text-[13px] leading-5 text-soft-ink">{hint}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
