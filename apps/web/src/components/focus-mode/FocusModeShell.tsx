"use client";

/**
 * Full-viewport shell for focus-mode editors (career page builder today, email
 * builder tomorrow). Owns the entire `h-dvh` , a fixed contextual top bar plus
 * a body that fills the remaining height and never scrolls at the shell level
 * (inner columns own their own scroll). Assumes it is mounted under a route
 * layout that has already stripped the app chrome (see app/(fullscreen)).
 */
export function FocusModeShell({
  topBar,
  children,
}: {
  topBar: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-paper">
      {topBar}
      <div className="flex min-h-0 flex-1">{children}</div>
    </div>
  );
}
