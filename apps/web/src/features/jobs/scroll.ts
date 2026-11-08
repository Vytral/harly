/**
 * Scrolling helpers for the job editor.
 *
 * The editor lives in a `h-dvh` shell whose ancestors are clipped. Native
 * `element.scrollIntoView()` / `focus()` scroll EVERY scrollable ancestor,
 * including `overflow: hidden` ones, which shifted the whole shell up and left
 * a blank page. These helpers scroll only the editor's own scroll root.
 */

export const EDITOR_SCROLL_ROOT_ATTR = "data-editor-scroll";

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Pure: the scrollTop that brings `el` into `root`, or null if already visible. */
export function computeScrollTop(args: {
  rootTop: number;
  rootHeight: number;
  rootScrollTop: number;
  elTop: number;
  elBottom: number;
  align: "start" | "nearest";
  /** Space reserved for sticky chrome at the bottom of the root. */
  bottomInset?: number;
  topInset?: number;
}): number | null {
  const { rootTop, rootHeight, rootScrollTop, elTop, elBottom, align } = args;
  const bottomInset = args.bottomInset ?? 0;
  const topInset = args.topInset ?? 0;
  const relTop = elTop - rootTop;
  const relBottom = elBottom - rootTop;
  if (align === "start") {
    return Math.max(0, rootScrollTop + relTop - topInset);
  }
  if (relTop >= topInset && relBottom <= rootHeight - bottomInset) return null;
  if (relTop < topInset) return Math.max(0, rootScrollTop + relTop - topInset);
  // Taller than the viewport: show its top instead of its bottom.
  const overflow = relBottom - (rootHeight - bottomInset);
  const maxShift = relTop - topInset;
  return rootScrollTop + Math.min(overflow, maxShift);
}

export function scrollWithinEditor(
  el: HTMLElement,
  options: {
    align?: "start" | "nearest";
    bottomInset?: number;
    topInset?: number;
  } = {},
) {
  const root = el.closest<HTMLElement>(`[${EDITOR_SCROLL_ROOT_ATTR}]`);
  if (!root) return;
  const rootRect = root.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  const top = computeScrollTop({
    rootTop: rootRect.top,
    rootHeight: root.clientHeight,
    rootScrollTop: root.scrollTop,
    elTop: rect.top,
    elBottom: rect.bottom,
    align: options.align ?? "nearest",
    bottomInset: options.bottomInset,
    topInset: options.topInset,
  });
  if (top == null) return;
  root.scrollTo({
    top,
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });
}

/** Scroll `root` (any scroller) just enough to reveal `el`, centred when it was off-screen. */
export function scrollInside(root: HTMLElement, el: HTMLElement) {
  const rootRect = root.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  const inset = 16;
  const visible =
    rect.top >= rootRect.top + inset && rect.bottom <= rootRect.bottom - inset;
  if (visible) return;
  const target =
    root.scrollTop +
    (rect.top - rootRect.top) -
    Math.max(inset, (root.clientHeight - rect.height) / 3);
  root.scrollTo({
    top: Math.max(0, target),
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });
}
