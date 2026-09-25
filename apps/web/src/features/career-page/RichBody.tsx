"use client";

import { useEffect, useRef } from "react";

import { writeCookiePreferences } from "@/lib/cookie-consent";
import { useEmbedConsent } from "@/components/use-embed-consent";

const PLACEHOLDER_HTML = `<div class="not-prose my-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-5 text-center dark:border-zinc-700 dark:bg-zinc-900"><p class="text-sm text-zinc-600 dark:text-zinc-300">This content is embedded from another site. It stays off until you allow embeds.</p><button type="button" data-allow-embeds class="mt-3 inline-flex items-center justify-center rounded-xl bg-zinc-900 px-3.5 py-2 text-[13px] font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">Allow embeds</button></div>`;

function withoutThirdPartyFrames(clean: string): string {
  const doc = new DOMParser().parseFromString(clean, "text/html");
  doc.querySelectorAll("iframe").forEach((frame) => {
    const placeholder = doc.createElement("div");
    placeholder.innerHTML = PLACEHOLDER_HTML;
    frame.replaceWith(placeholder.firstElementChild ?? placeholder);
  });
  return doc.body.innerHTML;
}

/**
 * Renders user-authored rich HTML safely. DOMPurify runs client-side so the
 * raw HTML never hits dangerouslySetInnerHTML unsanitized on the server.
 * The organization chooses what to embed. Third-party iframes stay unloaded
 * until the visitor allows embeds.
 */
export function RichBody({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const allowed = useEmbedConsent();

  useEffect(() => {
    const node = ref.current;
    if (!node || !html) return;
    let cancelled = false;
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
      if (cancelled || !ref.current) return;
      ref.current.innerHTML = allowed ? clean : withoutThirdPartyFrames(clean);
    });
    return () => {
      cancelled = true;
    };
  }, [html, allowed]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest("[data-allow-embeds]")) return;
      writeCookiePreferences(true);
    };
    node.addEventListener("click", onClick);
    return () => node.removeEventListener("click", onClick);
  }, []);

  if (!html) return null;

  return (
    <div
      ref={ref}
      className={className ?? "prose prose-zinc max-w-none dark:prose-invert prose-headings:font-semibold prose-headings:tracking-tight prose-a:text-[--career-accent] prose-a:no-underline hover:prose-a:underline prose-img:rounded-xl prose-blockquote:border-l-[--career-accent]"}
    />
  );
}
