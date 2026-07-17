"use client";

import { cn } from "@/lib/utils";

/**
 * Contextual top bar for focus-mode editors. Deliberately visually quieter than
 * the global dashboard TopBar , slimmer (h-12), translucent paper with a blur,
 * a single hairline underline, and NO logo , so the two never read as one
 * duplicated bar. Three slots: left (exit), center (context), right (actions).
 *
 * Builder-agnostic: fill the slots with whatever a given editor needs.
 */
export function FocusModeTopBar({
  left,
  center,
  right,
}: {
  left?: React.ReactNode;
  center?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <header
      className={cn(
        "relative z-40 flex h-12 shrink-0 items-center gap-3 px-3",
        "border-b border-border/70 bg-paper-raised/70 backdrop-blur-md",
        "supports-[backdrop-filter]:bg-paper-raised/55",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center">{left}</div>
      {center ? (
        <div className="flex shrink-0 items-center justify-center">{center}</div>
      ) : null}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        {right}
      </div>
    </header>
  );
}
