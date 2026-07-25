"use client";

import { useLayoutEffect, useRef, useState } from "react";

/** Fixed design width per device , the preview renders at this width and is
 *  scaled down to fit the available column, so it's always WYSIWYG and never
 *  overflows (Tailwind breakpoints resolve against the design width, not the
 *  cramped column). */
const DESIGN_WIDTH = { desktop: 1280, mobile: 390 } as const;

export function PreviewFrame({
  device,
  background,
  children,
}: {
  device: "desktop" | "mobile";
  background: string;
  children: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [contentHeight, setContentHeight] = useState(0);
  const designWidth = DESIGN_WIDTH[device];

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;
    const measure = () => {
      setScale(Math.min(1, container.clientWidth / designWidth));
      setContentHeight(content.offsetHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    ro.observe(content);
    return () => ro.disconnect();
  }, [designWidth]);

  return (
    <div ref={containerRef} className="h-full overflow-y-auto overflow-x-hidden">
      {/* Reserve the scaled footprint so the scroll area matches what's shown. */}
      <div
        className="mx-auto"
        style={{ width: designWidth * scale, height: contentHeight * scale }}
      >
        <div
          ref={contentRef}
          className="overflow-hidden rounded-xl border border-border bg-white shadow-lg"
          style={{
            width: designWidth,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            background,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
