/**
 * Shared class strings for the Deel-style header. Kept in one place so the
 * round icon buttons (search, settings, help, bell, avatar, AI) stay identical.
 */
export const headerRoundButton =
  "relative inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-pure-snow/60 text-near-ink/80 transition-colors duration-150 ease-out hover:bg-pure-snow hover:text-near-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink data-[state=open]:bg-pure-snow data-[state=open]:text-near-ink";

/** Small count bubble pinned to the top-right corner of a round button. */
export const headerCornerBadge =
  "font-chrome pointer-events-none absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full bg-chartreuse-signal px-1 text-[10.5px] font-semibold leading-[18px] text-chartreuse-ink ring-2 ring-lime-wash";
