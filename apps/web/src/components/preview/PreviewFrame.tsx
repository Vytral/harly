"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

export type PreviewDevice = "desktop" | "tablet" | "mobile";

/**
 * Real viewport width per device. The preview renders inside an iframe of
 * exactly this width, so viewport media queries (`sm:`, `lg:`, `min-h-screen`)
 * resolve the way a candidate's browser would, then the whole frame is scaled
 * down to fit the pane.
 */
export const PREVIEW_DEVICE_WIDTH: Record<PreviewDevice, number> = {
  desktop: 1280,
  tablet: 834,
  mobile: 390,
};

/** Tallest viewport for handheld devices; desktop fills the whole pane. */
const DEVICE_MAX_HEIGHT: Record<PreviewDevice, number> = {
  desktop: Infinity,
  tablet: 1112,
  mobile: 844,
};

const noopSubscribe = () => () => {};

const BLANK_DOC = "<!DOCTYPE html><html><head></head><body></body></html>";

/**
 * Same-origin iframe whose body is filled through a React portal: the preview
 * stays part of this React tree (context, state and live updates are instant,
 * no postMessage round-trip) while layout, breakpoints and scrolling belong to
 * the iframe's own viewport. The app's stylesheets are mirrored into the frame
 * and kept in sync (HMR, lazily loaded CSS chunks).
 *
 * Links and forms inside the preview never navigate: clicks are swallowed in
 * the capture phase (before next/link sees them). Hash links scroll inside the
 * frame; other links are reported through `onLinkClick` so the host can open
 * them in a new tab or explain why nothing happened.
 */
export function PreviewFrame({
  device,
  background,
  children,
  onLinkClick,
  className,
}: {
  device: PreviewDevice;
  background: string;
  children: React.ReactNode;
  /** Called with the absolute href of a blocked link click. */
  onLinkClick?: (href: string) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const onLinkClickRef = useRef(onLinkClick);
  useEffect(() => {
    onLinkClickRef.current = onLinkClick;
  }, [onLinkClick]);

  const designWidth = PREVIEW_DEVICE_WIDTH[device];

  // Track the pane size so the scale follows window and panel resizes.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () =>
      setBox({ width: container.clientWidth, height: container.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Prepare the frame document once it has loaded: styles, fonts, guards.
  // The iframe is client-only (a server-rendered one can finish loading before
  // hydration and we'd miss its load event); React's onLoad is attached to the
  // element before it is inserted, so the srcdoc load is never missed.
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const cleanupRef = useRef<(() => void) | undefined>(undefined);
  const setup = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    // Skip the transient about:blank document that precedes the srcdoc one.
    if (!doc || doc.URL !== "about:srcdoc" || !doc.body || doc.body.dataset.ready) return;
    cleanupRef.current?.();
    cleanupRef.current = prepareFrameDocument(doc, (href) => onLinkClickRef.current?.(href));
    setMountNode(doc.body);
  }, []);
  useEffect(() => {
    if (!mounted) return;
    setup();
    return () => cleanupRef.current?.();
  }, [mounted, setup]);

  const scale = box.width > 0 ? Math.min(1, box.width / designWidth) : 1;
  // Fill the pane vertically (in design pixels), capped at a real screen.
  const frameHeight = box.height > 0
    ? Math.min(DEVICE_MAX_HEIGHT[device], Math.floor(box.height / scale))
    : 800;
  const framed = device !== "desktop";

  return (
    <div
      ref={containerRef}
      data-career-preview=""
      className={cn("relative flex h-full w-full justify-center overflow-hidden", className)}
    >
      <div
        className="shrink-0"
        style={{ width: designWidth * scale, height: frameHeight * scale }}
      >
        {mounted ? (
        <iframe
          ref={iframeRef}
          onLoad={setup}
          title={`${device} preview`}
          srcDoc={BLANK_DOC}
          className={cn(
            "block border-0 bg-pure-snow shadow-[var(--shadow-card)]",
            framed ? "rounded-[28px] ring-[6px] ring-near-ink/90" : "rounded-[var(--radius-inner)]",
          )}
          style={{
            width: designWidth,
            height: frameHeight,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            // Frame documents are transparent, so this paints overscroll too.
            background,
          }}
        />
        ) : null}
      </div>
      {mountNode ? createPortal(children, mountNode) : null}
    </div>
  );
}

/**
 * Mirrors the host's stylesheets and root classes into the frame and installs
 * the link / form guards. Returns a cleanup function.
 */
function prepareFrameDocument(doc: Document, onLink: (href: string) => void) {
  const host = document;
  doc.body.dataset.ready = "1";
  // ThemeWrapper skips publishing its mode to the app when inside a preview.
  doc.documentElement.setAttribute("data-career-preview", "");
  doc.body.setAttribute("data-career-preview", "");
  // Font variables (next/font) and `antialiased` live on <html>. The admin's
  // own light/dark class must not leak: the career ThemeWrapper sets its own.
  doc.documentElement.className = host.documentElement.className
    .split(/\s+/)
    .filter((c) => c && c !== "dark" && c !== "light")
    .join(" ");
  doc.body.style.margin = "0";

  const clones = new Map<Node, Node>();
  const syncStyles = () => {
    const live = new Set<Node>();
    host.head.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
      live.add(node);
      if (clones.has(node)) {
        // <style> tags are rewritten in place by HMR.
        const clone = clones.get(node)!;
        if (node.nodeName === "STYLE" && clone.textContent !== node.textContent) {
          clone.textContent = node.textContent;
        }
        return;
      }
      const clone = node.cloneNode(true) as HTMLElement;
      if (clone instanceof HTMLLinkElement) clone.href = (node as HTMLLinkElement).href;
      doc.head.appendChild(clone);
      clones.set(node, clone);
    });
    for (const [node, clone] of clones) {
      if (!live.has(node)) {
        clone.parentNode?.removeChild(clone);
        clones.delete(node);
      }
    }
  };
  syncStyles();
  const observer = new MutationObserver(syncStyles);
  observer.observe(host.head, { childList: true, subtree: true, characterData: true });

  const onClick = (event: MouseEvent) => {
    // No instanceof: frame nodes belong to the iframe's realm.
    const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!anchor) return;
    event.preventDefault();
    event.stopPropagation();
    const raw = anchor.getAttribute("href") ?? "";
    if (raw.startsWith("#")) {
      const target = raw.length > 1 ? doc.getElementById(decodeURIComponent(raw.slice(1))) : null;
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    onLink(new URL(raw, window.location.href).toString());
  };
  const onSubmit = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  // Keyboard shortcuts (⌘S…) pressed while the frame has focus would never
  // reach the host window; re-dispatch modifier combos there.
  const onKeyDown = (event: KeyboardEvent) => {
    if (!event.metaKey && !event.ctrlKey) return;
    const forwarded = new KeyboardEvent("keydown", {
      key: event.key,
      code: event.code,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      cancelable: true,
    });
    window.dispatchEvent(forwarded);
    if (forwarded.defaultPrevented) event.preventDefault();
  };
  // Capture on the frame document runs before React's listeners on the
  // portal container, so next/link never gets to call router.push.
  doc.addEventListener("click", onClick, true);
  doc.addEventListener("submit", onSubmit, true);
  doc.addEventListener("keydown", onKeyDown);

  return () => {
    observer.disconnect();
    doc.removeEventListener("click", onClick, true);
    doc.removeEventListener("submit", onSubmit, true);
    doc.removeEventListener("keydown", onKeyDown);
  };
}
