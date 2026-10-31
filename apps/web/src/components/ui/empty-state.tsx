import Link from "next/link";
import type { Route } from "next";
import { Inbox } from "lucide-react";
import { isValidElement, type ComponentType, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SpotEmpty, SpotIcon } from "@/components/ui/spot-illustrations";

/**
 * Structural, not family-specific: Lucide and Phosphor glyphs both satisfy it,
 * so a screen keeps whichever family it already speaks.
 */
export type EmptyStateIcon = ComponentType<{ className?: string }>;

/** A link-shaped primary action. Free-form nodes are rendered as given. */
export type EmptyStateLinkAction = { href: Route; label: string };

export type EmptyStateAction = ReactNode | EmptyStateLinkAction;

/**
 * The one empty state.
 *
 * An empty state has exactly two jobs: name what would be here, and say what
 * puts it there. `description` is required for that reason: if you cannot say
 * what the next move is, the section probably should not be rendered at all.
 *
 * Shapes:
 * - `variant="empty"` (default): "nothing exists yet". An invitation, drawn as
 *   a dashed panel with an icon tile.
 * - `variant="filtered"`: "your filters excluded everything". An escape hatch,
 *   drawn without the panel frame so it does not read as a dead end.
 * - `compact`: for panels, tables and drawers where the surrounding frame
 *   already exists. No panel border, no icon tile.
 *
 * `action` takes either a node (for example a `Button` that clears a filter)
 * or `{ href, label }` for a navigation CTA. `secondaryAction` is a node.
 */
export function EmptyState({
  icon,
  illustration,
  title,
  description,
  action,
  secondaryAction,
  variant = "empty",
  compact = false,
  className,
}: {
  icon?: EmptyStateIcon;
  /**
   * Replaces the default spot illustration (a lime-wash blob holding `icon`,
   * or the folder spot when no icon is given). Pass `null` for no artwork.
   */
  illustration?: ReactNode;
  title: string;
  description: ReactNode;
  action?: EmptyStateAction;
  secondaryAction?: ReactNode;
  variant?: "empty" | "filtered";
  compact?: boolean;
  className?: string;
}) {
  const framed = variant === "empty" && !compact;
  const Icon = icon ?? Inbox;
  const art =
    illustration !== undefined ? (
      illustration
    ) : icon ? (
      <SpotIcon icon={icon} />
    ) : (
      <SpotEmpty size={80} />
    );

  return (
    <div
      className={cn(
        "animate-empty-state flex flex-col items-center text-center",
        compact ? "px-4 py-6" : "px-6 py-12",
        framed && "rounded-[var(--radius-card)] border border-dashed border-mist-border bg-card",
        className,
      )}
    >
      {compact ? (
        <Icon className="mb-2 size-4 text-quiet-mist" />
      ) : art ? (
        <div className="mb-4 flex items-center justify-center">{art}</div>
      ) : null}
      <p className="text-[15px] font-semibold tracking-tight text-near-ink">{title}</p>
      <div className="mt-1.5 max-w-md text-sm leading-6 text-soft-ink">
        {description}
      </div>
      {action || secondaryAction ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action ? renderAction(action, compact) : null}
          {secondaryAction ?? null}
        </div>
      ) : null}
    </div>
  );
}

function renderAction(action: EmptyStateAction, compact: boolean) {
  if (isLinkAction(action)) {
    return (
      <Button asChild size={compact ? "sm" : "default"}>
        <Link href={action.href}>{action.label}</Link>
      </Button>
    );
  }
  return action;
}

function isLinkAction(action: EmptyStateAction): action is EmptyStateLinkAction {
  if (!action || typeof action !== "object") return false;
  return !isValidElement(action) && "href" in action && "label" in action;
}
