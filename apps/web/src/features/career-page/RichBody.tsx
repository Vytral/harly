"use client";

import { useEffect, useRef } from "react";

/**
 * Renders user-authored rich HTML safely. DOMPurify runs client-side so the
 * raw HTML never hits dangerouslySetInnerHTML unsanitized on the server.
 * Allows iframes, images, videos, and all standard HTML , the admin is trusted
 * to embed what they want on their own career page.
 */
export function RichBody({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !html) return;
    import("dompurify").then(({ default: DOMPurify }) => {
      const clean = DOMPurify.sanitize(html, {
        ADD_TAGS: ["iframe", "video", "source", "figure", "figcaption"],
        ADD_ATTR: [
          "allowfullscreen",
          "frameborder",
          "allow",
          "src",
          "width",
          "height",
          "controls",
          "autoplay",
          "muted",
          "loop",
          "playsinline",
          "loading",
          "style",
          "class",
          "target",
          "rel",
        ],
        FORCE_BODY: false,
      });
      if (ref.current) ref.current.innerHTML = clean;
    });
  }, [html]);

  if (!html) return null;

  return (
    <div
      ref={ref}
      className={className ?? "prose prose-zinc max-w-none dark:prose-invert prose-headings:font-semibold prose-headings:tracking-tight prose-a:text-[--career-accent] prose-a:no-underline hover:prose-a:underline prose-img:rounded-xl prose-blockquote:border-l-[--career-accent]"}
    />
  );
}
